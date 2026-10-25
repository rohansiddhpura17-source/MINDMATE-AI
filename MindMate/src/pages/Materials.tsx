import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Tabs } from '../components/ui/Tabs';
import { MaterialCard } from '../components/shared/MaterialCard';
import { EmptyState } from '../components/ui/EmptyState';
import { materials as mockMaterials } from '../data/mockData';
import { Material } from '../types';
import {
  Upload,
  FileText,
  Search as SearchIcon,
  Filter,
  Sparkles,
  BookOpen,
  HelpCircle,
  Layers,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  FileImage,
  FileCode
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { getMaterials, deleteMaterial } from '../lib/db';
import {
  validateDocument,
  extractDocumentContent,
  chunkExtractedPages,
  generateMaterialArtifacts,
  saveProcessedMaterial
} from '../services/materials/documentProcessor';
import { offlineLearner } from '../services/storage/offlineLearner';

export default function Materials() {
  const { user, showToast } = useAppContext();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [materials, setMaterials] = useState<any[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  // Upload & Extraction State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState('');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Flashcard Tab State
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Quiz Tab State
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        // Try Supabase first
        const res = await getMaterials(user!.id);
        if (res.data && res.data.length > 0) {
          setMaterials(res.data);
          return;
        }

        // Try Offline Cached Materials
        const cached = await offlineLearner.getCachedMaterials(user!.id);
        if (cached && cached.length > 0) {
          setMaterials(cached);
          return;
        }

        setMaterials([]);
      } catch (err) {
        console.error('Failed to load materials:', err);
        const cached = await offlineLearner.getCachedMaterials(user!.id);
        if (cached && cached.length > 0) setMaterials(cached);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  const handleFileProcess = async (file: File) => {
    if (!user) {
      showToast('Please sign in to upload learning materials.', 'error');
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    setUploadStage('Validating file format and integrity...');
    setUploadPercent(5);

    try {
      const validation = await validateDocument(file);
      if (!validation.valid) {
        setUploadError(validation.error || 'Invalid file.');
        showToast(validation.error || 'Invalid file.', 'error');
        return;
      }

      // Step 1: Hybrid Text Extraction & OCR
      const extraction = await extractDocumentContent(file, (stage, percent) => {
        setUploadStage(stage);
        setUploadPercent(percent);
      });

      // Step 2: Chunking & AI Artifact Generation
      setUploadStage('Generating AI summary, concepts, and flashcards...');
      setUploadPercent(85);
      const chunks = chunkExtractedPages(extraction.pages);
      const artifacts = await generateMaterialArtifacts(file.name, chunks, extraction.rawContent);

      // Step 3: Persistence in DB and Offline Store
      setUploadStage('Saving study material and knowledge graph...');
      setUploadPercent(95);
      const savedMaterial = await saveProcessedMaterial(user.id, extraction, artifacts);

      setMaterials((prev) => [savedMaterial, ...prev.filter((m) => m.id !== savedMaterial.id)]);
      setSelectedMaterial(savedMaterial);

      const ocrNotice = extraction.ocrApplied ? ' (OCR text extracted from scanned pages)' : '';
      showToast(`Successfully processed "${file.name}"${ocrNotice}!`, 'success');
    } catch (err: any) {
      console.error('Document processing error:', err);
      const message = err.message || 'Failed to process document.';
      setUploadError(message);
      showToast(message, 'error');
    } finally {
      setIsUploading(false);
      setUploadStage('');
      setUploadPercent(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileProcess(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileProcess(file);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMaterial(id);
      setMaterials((prev) => prev.filter((m) => m.id !== id));
      if (user) {
        const cached = await offlineLearner.getCachedMaterials(user.id);
        const filtered = cached.filter((m) => m.id !== id);
        await offlineLearner.cacheLearningContent(`materials:${user.id}`, filtered);
      }
      setSelectedMaterial(null);
      showToast('Material deleted.', 'success');
    } catch (err) {
      console.error('Failed to delete material:', err);
      showToast('Failed to delete material.', 'error');
    }
  };

  // Helper to parse parsed JSON or structured data
  const parseJsonField = (field: any, fallback: any) => {
    if (!field) return fallback;
    if (typeof field === 'object') return field;
    try {
      return JSON.parse(field);
    } catch {
      return fallback;
    }
  };

  const getMaterialDetails = (mat: any) => {
    if (!mat) return null;
    const summaryData = parseJsonField(mat.summary, {
      overview: typeof mat.summary === 'string' && !mat.summary.startsWith('{') ? mat.summary : 'No summary generated.',
      keyThemes: [],
      takeaways: []
    });

    const keyConceptsData = parseJsonField(mat.key_concepts, []);

    const flashcardsData =
      mat.metadata?.flashcards ||
      (Array.isArray(keyConceptsData) && keyConceptsData.length > 0
        ? keyConceptsData.map((k: any, i: number) => ({
            id: `card-${i}`,
            front: `What is the significance of ${k.concept || 'this topic'}?`,
            back: k.definition || 'Key concept from the material.',
            pageCitation: k.pageNumber || 1
          }))
        : [
            {
              id: 'card-1',
              front: 'What is the main topic covered in this document?',
              back: mat.name,
              pageCitation: 1
            }
          ]);

    const quizQuestionsData =
      mat.metadata?.quizQuestions ||
      (Array.isArray(keyConceptsData) && keyConceptsData.length > 0
        ? keyConceptsData.slice(0, 3).map((k: any, i: number) => ({
            id: i + 1,
            question: `Which concept is defined as: "${(k.definition || '').slice(0, 90)}..."?`,
            options: [k.concept, 'Secondary Routine', 'External Protocol', 'Fallback Rule'].sort(
              () => 0.5 - Math.random()
            ),
            correct: 0,
            explanation: `According to the document: ${k.definition}`,
            pageCitation: k.pageNumber || 1
          }))
        : []);

    return {
      summary: summaryData,
      keyConcepts: Array.isArray(keyConceptsData) ? keyConceptsData : [],
      flashcards: flashcardsData,
      quizQuestions: quizQuestionsData
    };
  };

  const currentDetails = selectedMaterial ? getMaterialDetails(selectedMaterial) : null;

  // Filtered materials
  const filteredMaterials = materials.filter((m) => {
    const matchesSearch =
      (m.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (typeof m.key_concepts === 'string' && m.key_concepts.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType =
      typeFilter === 'all' ||
      (typeFilter === 'pdf' && m.type?.toUpperCase() === 'PDF') ||
      (typeFilter === 'image' && m.type?.toUpperCase() === 'IMAGE') ||
      (typeFilter === 'text' && m.type?.toUpperCase() === 'TEXT');

    return matchesSearch && matchesType;
  });

  const displayList = materials.length > 0 ? filteredMaterials : mockMaterials;

  return (
    <AppShell pageTitle="Materials" pageSubtitle="Upload notes and let MindMate extract knowledge">
      <div className="max-w-5xl space-y-8">
        {/* Upload Drop Zone Area */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-card p-10 text-center transition-all ${
            isDragging
              ? 'border-primary bg-indigo-50/80 dark:bg-indigo-950/40 ring-4 ring-primary/20 scale-[1.01]'
              : isUploading
              ? 'border-primary bg-indigo-50/50 dark:bg-indigo-950/20'
              : 'border-border bg-surface hover:border-primary/50'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileInputChange}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md"
            className="hidden"
          />

          <div className="mx-auto w-16 h-16 bg-primary/10 dark:bg-primary/20 rounded-full flex items-center justify-center mb-4 text-primary">
            {isUploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            ) : (
              <Upload className="h-8 w-8" />
            )}
          </div>

          <h3 className="text-xl font-bold mb-2 text-dark">
            {isUploading ? 'Processing Document...' : 'Upload PDF / Notes / Scanned Images'}
          </h3>

          <p className="text-muted mb-6 max-w-md mx-auto text-sm">
            Drag & drop your files here or select below. MindMate supports text-based PDFs, scanned notes with optical OCR, images, and text notes.
          </p>

          {/* Progress Bar during upload / OCR */}
          {isUploading && (
            <div className="max-w-md mx-auto mb-6 bg-white dark:bg-slate-900 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/50 shadow-sm text-left">
              <div className="flex items-center justify-between text-xs font-semibold text-indigo-900 dark:text-indigo-200 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
                  {uploadStage || 'Processing...'}
                </span>
                <span>{uploadPercent}%</span>
              </div>
              <div className="w-full bg-indigo-100 dark:bg-indigo-950 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300 rounded-full"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Upload Error Alert */}
          {uploadError && (
            <div className="max-w-md mx-auto mb-6 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs flex items-center gap-2 text-left">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{uploadError}</span>
            </div>
          )}

          <div className="flex items-center justify-center gap-3">
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              size="lg"
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              {isUploading ? 'Extracting Text...' : 'Select File to Upload'}
            </Button>
          </div>
          <p className="text-[11px] text-muted mt-3">
            Supports PDF, PNG, JPG, WEBP, TXT, MD (Max 20MB)
          </p>
        </div>

        {/* List Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-dark">Your Materials</h3>
            <p className="text-xs text-muted">
              {displayList.length} {displayList.length === 1 ? 'document' : 'documents'} ready for active learning
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search materials or concepts..."
                className="w-full pl-9 pr-4 py-2 bg-surface text-dark border border-border rounded-btn text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex items-center bg-surface border border-border rounded-btn p-1 text-xs">
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  typeFilter === 'all'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-muted hover:text-dark'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setTypeFilter('pdf')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  typeFilter === 'pdf'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-muted hover:text-dark'
                }`}
              >
                PDF
              </button>
              <button
                onClick={() => setTypeFilter('image')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  typeFilter === 'image'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-muted hover:text-dark'
                }`}
              >
                Images
              </button>
              <button
                onClick={() => setTypeFilter('text')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  typeFilter === 'text'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-muted hover:text-dark'
                }`}
              >
                Text
              </button>
            </div>
          </div>
        </div>

        {/* Materials List */}
        <div className="grid grid-cols-1 gap-4">
          {displayList.length > 0 ? (
            displayList.map((material) => (
              <MaterialCard
                key={material.id}
                material={{
                  ...material,
                  pages: material.pages || 1,
                  date: material.date || (material.created_at ? new Date(material.created_at).toLocaleDateString() : 'Recent')
                }}
                onClick={(mat) => {
                  setSelectedMaterial(mat);
                  setActiveTab('summary');
                  setCurrentFlashcardIndex(0);
                  setIsFlipped(false);
                }}
              />
            ))
          ) : (
            <EmptyState
              icon={FileText}
              title="No materials match your filter"
              description="Upload a PDF or adjust your search filter to see materials here."
            />
          )}
        </div>
      </div>

      {/* Upgraded Material Detail Modal */}
      <Modal
        isOpen={!!selectedMaterial}
        onClose={() => setSelectedMaterial(null)}
        title={selectedMaterial?.name || 'Material Details'}
        className="max-w-2xl"
      >
        <div className="mb-6">
          <Tabs
            tabs={[
              { id: 'summary', label: 'AI Summary' },
              { id: 'concepts', label: 'Key Concepts' },
              { id: 'flashcards', label: 'Flashcards' },
              { id: 'quiz', label: 'Practice Quiz' }
            ]}
            activeTab={activeTab}
            onChange={(tab) => {
              setActiveTab(tab);
              setIsFlipped(false);
            }}
          />
        </div>

        <div className="min-h-[340px]">
          {/* TAB 1: AI SUMMARY */}
          {activeTab === 'summary' && currentDetails && (
            <div className="space-y-5 text-sm">
              <div className="bg-surface p-4 rounded-xl border border-border">
                <h5 className="font-semibold text-dark mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Overview
                </h5>
                <p className="text-dark/80 leading-relaxed">
                  {currentDetails.summary.overview}
                </p>
              </div>

              {currentDetails.summary.keyThemes?.length > 0 && (
                <div>
                  <h5 className="font-semibold text-dark mb-2">Key Themes</h5>
                  <div className="space-y-2">
                    {currentDetails.summary.keyThemes.map((theme: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-surface border border-border flex items-start justify-between gap-3"
                      >
                        <div>
                          <p className="font-medium text-dark">{theme.theme}</p>
                          <p className="text-xs text-muted mt-0.5">{theme.description}</p>
                        </div>
                        {theme.pages?.length > 0 && (
                          <span className="text-[11px] bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full shrink-0">
                            Page {theme.pages.join(', ')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentDetails.summary.takeaways?.length > 0 && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800">
                  <h5 className="font-semibold text-emerald-900 dark:text-emerald-200 mb-2 flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Core Takeaways
                  </h5>
                  <ul className="space-y-1.5 list-disc pl-5 text-xs text-emerald-900/90 dark:text-emerald-200/90">
                    {currentDetails.summary.takeaways.map((t: any, idx: number) => (
                      <li key={idx}>
                        {t.text}{' '}
                        {t.page && <span className="opacity-75">(Page {t.page})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <Button
                  variant="primary"
                  className="gap-2"
                  onClick={() => {
                    navigate(`/learn?topic=${encodeURIComponent(selectedMaterial?.name || 'Document')}`);
                  }}
                >
                  <BookOpen className="h-4 w-4" />
                  Study with Mate AI
                </Button>

                <Button
                  variant="danger"
                  className="gap-1.5 text-xs"
                  onClick={() => handleDelete(selectedMaterial?.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Material
                </Button>
              </div>
            </div>
          )}

          {/* TAB 2: KEY CONCEPTS */}
          {activeTab === 'concepts' && currentDetails && (
            <div className="space-y-4">
              {currentDetails.keyConcepts.length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {currentDetails.keyConcepts.map((concept: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-surface border border-border hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <h5 className="font-semibold text-dark text-sm">{concept.concept}</h5>
                        {concept.pageNumber && (
                          <span className="text-[11px] font-medium text-muted bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                            Page {concept.pageNumber}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-dark/80 leading-relaxed mb-3">
                        {concept.definition}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-primary hover:text-primary-hover p-0 h-auto"
                        onClick={() => {
                          navigate(
                            `/learn?topic=${encodeURIComponent(concept.concept)}&prompt=${encodeURIComponent(
                              `Explain "${concept.concept}" from my notes in detail.`
                            )}`
                          );
                        }}
                      >
                        Ask Mate to explain this concept →
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted text-sm">
                  No concepts extracted yet from this document.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: FLASHCARDS */}
          {activeTab === 'flashcards' && currentDetails && (
            <div className="space-y-6">
              {currentDetails.flashcards.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between text-xs text-muted mb-3">
                    <span>
                      Card {currentFlashcardIndex + 1} of {currentDetails.flashcards.length}
                    </span>
                    <span>Click card to reveal answer</span>
                  </div>

                  {/* Flippable Card Container */}
                  <div
                    onClick={() => setIsFlipped(!isFlipped)}
                    className="cursor-pointer min-h-[200px] p-8 rounded-2xl border-2 border-indigo-100 dark:border-indigo-900 bg-gradient-to-br from-white to-indigo-50/30 dark:from-slate-900 dark:to-indigo-950/20 shadow-sm flex flex-col justify-between transition-all hover:shadow-md"
                  >
                    <div className="flex items-center justify-between text-xs text-primary font-semibold">
                      <span>{isFlipped ? 'ANSWER / DEFINITION' : 'PROMPT / QUESTION'}</span>
                      {currentDetails.flashcards[currentFlashcardIndex]?.pageCitation && (
                        <span className="text-[11px] text-muted">
                          Page {currentDetails.flashcards[currentFlashcardIndex].pageCitation}
                        </span>
                      )}
                    </div>

                    <div className="py-6 text-center">
                      <p className="text-base sm:text-lg font-medium text-dark leading-relaxed">
                        {isFlipped
                          ? currentDetails.flashcards[currentFlashcardIndex]?.back
                          : currentDetails.flashcards[currentFlashcardIndex]?.front}
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-1.5 text-xs text-muted">
                      <RotateCw className="h-3.5 w-3.5" />
                      <span>{isFlipped ? 'Click to view question' : 'Click to flip'}</span>
                    </div>
                  </div>

                  {/* Flashcard Navigation */}
                  <div className="flex items-center justify-between mt-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={currentFlashcardIndex === 0}
                      onClick={() => {
                        setCurrentFlashcardIndex((prev) => Math.max(0, prev - 1));
                        setIsFlipped(false);
                      }}
                      className="gap-1 text-xs"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Previous
                    </Button>

                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={currentFlashcardIndex === currentDetails.flashcards.length - 1}
                      onClick={() => {
                        setCurrentFlashcardIndex((prev) =>
                          Math.min(currentDetails.flashcards.length - 1, prev + 1)
                        );
                        setIsFlipped(false);
                      }}
                      className="gap-1 text-xs"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted text-sm">
                  No flashcards available for this material.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PRACTICE QUIZ */}
          {activeTab === 'quiz' && currentDetails && (
            <div className="space-y-6">
              {currentDetails.quizQuestions.length > 0 ? (
                <div className="space-y-6">
                  {currentDetails.quizQuestions.map((q: any, qIdx: number) => {
                    const selectedOpt = quizAnswers[q.id];
                    const isSubmitted = quizSubmitted[q.id];
                    const isCorrect = selectedOpt === q.correct;

                    return (
                      <div
                        key={q.id || qIdx}
                        className="p-5 rounded-xl bg-surface border border-border space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-semibold text-dark text-sm">
                            {qIdx + 1}. {q.question}
                          </p>
                          {q.pageCitation && (
                            <span className="text-[11px] text-muted shrink-0 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                              Page {q.pageCitation}
                            </span>
                          )}
                        </div>

                        {/* Options */}
                        <div className="space-y-2">
                          {q.options?.map((opt: string, optIdx: number) => {
                            let btnStyle = 'border-border bg-surface text-dark hover:border-primary/50';
                            if (isSubmitted) {
                              if (optIdx === q.correct) {
                                btnStyle =
                                  'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 font-semibold';
                              } else if (selectedOpt === optIdx) {
                                btnStyle =
                                  'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200';
                              }
                            } else if (selectedOpt === optIdx) {
                              btnStyle = 'border-primary bg-indigo-50 dark:bg-indigo-950/40 text-primary font-semibold';
                            }

                            return (
                              <button
                                key={optIdx}
                                disabled={isSubmitted}
                                onClick={() =>
                                  setQuizAnswers((prev) => ({ ...prev, [q.id]: optIdx }))
                                }
                                className={`w-full text-left p-3 rounded-lg border text-xs transition-colors flex items-center justify-between ${btnStyle}`}
                              >
                                <span>{opt}</span>
                                {isSubmitted && optIdx === q.correct && (
                                  <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* Submit Answer & Feedback */}
                        {!isSubmitted ? (
                          <div className="pt-1">
                            <Button
                              size="sm"
                              disabled={selectedOpt === undefined}
                              onClick={() =>
                                setQuizSubmitted((prev) => ({ ...prev, [q.id]: true }))
                              }
                              className="text-xs"
                            >
                              Check Answer
                            </Button>
                          </div>
                        ) : (
                          <div
                            className={`p-3 rounded-lg text-xs ${
                              isCorrect
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800'
                            }`}
                          >
                            <p className="font-semibold mb-1">
                              {isCorrect ? 'Correct!' : 'MindMate Insight:'}
                            </p>
                            <p className="leading-relaxed">{q.explanation}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-muted text-sm">
                  No practice quiz questions generated for this document.
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </AppShell>
  );
}
