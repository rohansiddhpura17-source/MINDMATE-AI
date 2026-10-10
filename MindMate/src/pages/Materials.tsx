import React, { useState, useEffect, useRef } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Tabs } from '../components/ui/Tabs';
import { MaterialCard } from '../components/shared/MaterialCard';
import { EmptyState } from '../components/ui/EmptyState';
import { materials as mockMaterials } from '../data/mockData';
import {
  Upload,
  FileText,
  Search as SearchIcon,
  Filter,
  CheckCircle,
  AlertTriangle,
  Loader2,
  HardDriveDownload,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Send,
  BookOpen,
  Award,
  Layers,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { learnerApi, MaterialRecord, MaterialQuizQuestion } from '../services/api/learnerApi';
import { offlineLearner } from '../services/storage/offlineLearner';

export default function Materials() {
  const { showToast, isAuthenticated, user } = useAppContext();
  const [materials, setMaterials] = useState<MaterialRecord[]>(mockMaterials as any);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialRecord | null>(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Flashcards state
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);

  // Document Q&A state
  const [queryInput, setQueryInput] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryResult, setQueryResult] = useState<{
    answer: string;
    citations: Array<{ pageNumber: number; chunkIndex: number; snippet: string }>;
  } | null>(null);

  // Document Quiz state
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<MaterialQuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Offline caching status
  const [isCachedOffline, setIsCachedOffline] = useState(false);

  const loadMaterials = async () => {
    if (!isAuthenticated) return;
    try {
      if (navigator.onLine) {
        const mats = await learnerApi.getMaterials();
        if (mats && mats.length > 0) {
          // Check cached status in IndexedDB for each material
          const userId = user?.id || 'default';
          const cachedList = await offlineLearner.getCachedMaterials(userId);
          const cachedIds = new Set(cachedList.map((m: any) => m.id));
          const withOffline = mats.map((m) => ({
            ...m,
            isOfflineCached: cachedIds.has(m.id),
          }));
          setMaterials(withOffline);
          return;
        }
      }
      // If offline or no server materials, load from IndexedDB
      const userId = user?.id || 'default';
      const cached = await offlineLearner.getCachedMaterials(userId);
      if (cached && cached.length > 0) {
        setMaterials(cached.map((m: any) => ({ ...m, isOfflineCached: true })));
      }
    } catch (err) {
      console.warn('[Load Materials Error, falling back to cache]', err);
      if (user?.id) {
        const cached = await offlineLearner.getCachedMaterials(user.id);
        if (cached && cached.length > 0) {
          setMaterials(cached.map((m: any) => ({ ...m, isOfflineCached: true })));
        }
      }
    }
  };

  useEffect(() => {
    loadMaterials();
  }, [isAuthenticated, user?.id]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFileUpload(file);
    }
  };

  const processFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      showToast('Please select a valid PDF document.', 'error');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      showToast('File size exceeds the 15MB limit.', 'error');
      return;
    }

    setIsUploading(true);
    setUploadProgressText('Verifying PDF magic signature & extracting text...');

    try {
      if (!isAuthenticated) {
        showToast('Please log in to upload and process real PDF documents.', 'info');
        return;
      }

      setUploadProgressText('Analyzing with Gemini AI: chunking, summary & flashcards...');
      const created = await learnerApi.uploadMaterial(file);

      // Auto-cache locally in IndexedDB for offline access
      if (user?.id) {
        await offlineLearner.cacheMaterial(user.id, { ...created, isOfflineCached: true });
        created.isOfflineCached = true;
      }

      setMaterials((prev) => [created, ...prev]);

      if (created.status === 'OCR_NEEDED') {
        showToast('Uploaded! Notice: Scanned/image-only PDF detected. OCR is required.', 'info');
      } else {
        showToast('Document parsed and grounded curriculum generated!', 'success');
      }

      // Automatically open the new material
      setSelectedMaterial(created);
      setActiveTab('summary');
    } catch (err: any) {
      console.error('[Upload Error]', err);
      showToast(err?.message || 'Document upload and parsing failed', 'error');
    } finally {
      setIsUploading(false);
      setUploadProgressText('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSelectMaterial = async (mat: MaterialRecord) => {
    setSelectedMaterial(mat);
    setActiveTab('summary');
    setCurrentCardIndex(0);
    setIsCardFlipped(false);
    setQueryResult(null);
    setQuizQuestions([]);
    setQuizAnswers({});
    setQuizSubmitted(false);

    // Check offline status
    if (user?.id) {
      const cached = await offlineLearner.getCachedMaterial(String(mat.id));
      setIsCachedOffline(Boolean(cached));
    }

    // Fetch full details if needed
    if (isAuthenticated && (!mat.summary || !mat.flashcards)) {
      try {
        const full = await learnerApi.getMaterial(String(mat.id));
        setSelectedMaterial((prev) => ({ ...prev, ...full }));
      } catch {
        // Fallback to offline cache
        const cached = await offlineLearner.getCachedMaterial(String(mat.id));
        if (cached) {
          setSelectedMaterial(cached);
        }
      }
    }
  };

  const handleDeleteMaterial = async (id: string | number) => {
    if (!window.confirm('Are you sure you want to delete this learning material?')) {
      return;
    }
    try {
      await learnerApi.deleteMaterial(id);
      setMaterials((prev) => prev.filter((m) => m.id !== id));
      if (selectedMaterial?.id === id) {
        setSelectedMaterial(null);
      }
      showToast('Document and chunks removed.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete material', 'error');
    }
  };

  const handleToggleOfflineCache = async () => {
    if (!selectedMaterial || !user?.id) return;
    try {
      if (isCachedOffline) {
        showToast('Material already saved offline.', 'info');
        return;
      }
      // Fetch chunks to store for offline tutoring
      let chunks: any[] = [];
      try {
        chunks = await learnerApi.getMaterialChunks(String(selectedMaterial.id));
      } catch {}

      await offlineLearner.cacheMaterial(user.id, { ...selectedMaterial, isOfflineCached: true });
      if (chunks.length > 0) {
        await offlineLearner.cacheMaterialChunks(String(selectedMaterial.id), chunks);
      }
      setIsCachedOffline(true);
      setMaterials((prev) =>
        prev.map((m) => (m.id === selectedMaterial.id ? { ...m, isOfflineCached: true } : m))
      );
      showToast('Document, summary & flashcards saved for offline study!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to cache offline', 'error');
    }
  };

  const handleAskQuestion = async () => {
    if (!queryInput.trim() || !selectedMaterial) return;
    setIsQuerying(true);
    setQueryResult(null);

    try {
      const res = await learnerApi.queryMaterial(String(selectedMaterial.id), queryInput.trim());
      setQueryResult(res);
    } catch (err: any) {
      showToast(err?.message || 'Failed to query document', 'error');
    } finally {
      setIsQuerying(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!selectedMaterial) return;
    setIsGeneratingQuiz(true);
    setQuizAnswers({});
    setQuizSubmitted(false);

    try {
      const questions = await learnerApi.generateMaterialQuiz(String(selectedMaterial.id), 4);
      setQuizQuestions(questions);
      showToast('Practice quiz generated from document!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to generate quiz', 'error');
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleQuizSubmit = async () => {
    if (!selectedMaterial || quizQuestions.length === 0) return;
    let correctCount = 0;
    quizQuestions.forEach((q, idx) => {
      if (quizAnswers[idx] === q.correct) {
        correctCount++;
      }
    });

    const score = Math.round((correctCount / quizQuestions.length) * 100);
    setQuizSubmitted(true);

    try {
      if (isAuthenticated) {
        await learnerApi.recordQuiz({
          topicId: `doc-${selectedMaterial.id}`,
          topicName: selectedMaterial.name,
          score,
          totalQuestions: quizQuestions.length,
          correctAnswers: correctCount,
        });
        showToast(`Quiz completed! Score: ${score}% recorded to your progress.`, 'success');
      } else {
        showToast(`Quiz completed! Score: ${score}%`, 'info');
      }
    } catch (err: any) {
      showToast('Quiz evaluated locally: ' + score + '%', 'info');
    }
  };

  const filteredMaterials = materials.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const flashcards = selectedMaterial?.flashcards || [];

  return (
    <AppShell pageTitle="Materials" pageSubtitle="Real document ingestion and source-grounded learning">
      <div className="max-w-5xl space-y-8">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Upload Drag & Drop Area */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) processFileUpload(file);
          }}
          className={`border-2 border-dashed rounded-card p-10 text-center transition-all ${
            isDragging
              ? 'border-primary bg-indigo-50/80 scale-[1.01]'
              : isUploading
              ? 'border-primary bg-indigo-50'
              : 'border-border bg-surface hover:border-primary/50'
          }`}
        >
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4 text-primary">
            {isUploading ? <Loader2 className="h-8 w-8 animate-spin" /> : <Upload className="h-8 w-8" />}
          </div>
          <h3 className="text-xl font-bold mb-2 text-dark">
            {isUploading ? 'Ingesting PDF Document...' : 'Upload Real PDF Document'}
          </h3>
          <p className="text-muted mb-4 max-w-md mx-auto text-sm">
            {isUploading
              ? uploadProgressText
              : 'Drag and drop your lecture notes or textbook chapters (up to 15MB, 100 pages). MindMate extracts text by page, creates overlapping chunks, and generates grounded summaries, flashcards, and quizzes.'}
          </p>
          <div className="flex justify-center gap-3">
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              size="lg"
            >
              {isUploading ? 'Processing Document...' : 'Select PDF to Upload'}
            </Button>
          </div>
        </div>

        {/* List Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            Your Documents
            <span className="text-xs font-normal text-muted bg-gray-100 px-2 py-0.5 rounded-full">
              {filteredMaterials.length}
            </span>
          </h3>
          <div className="flex gap-2">
            <div className="relative w-64">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="text"
                placeholder="Search materials..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-border rounded-btn text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Materials List */}
        <div className="grid grid-cols-1 gap-4">
          {filteredMaterials.length > 0 ? (
            filteredMaterials.map((material) => (
              <MaterialCard
                key={material.id}
                material={material}
                onClick={handleSelectMaterial}
                onDelete={handleDeleteMaterial}
                onCacheOffline={handleToggleOfflineCache}
              />
            ))
          ) : (
            <EmptyState
              icon={FileText}
              title="No documents yet"
              description="Upload your first PDF to generate source-grounded summaries, flashcards, and quizzes."
            />
          )}
        </div>
      </div>

      {/* Material Detail Modal */}
      <Modal
        isOpen={!!selectedMaterial}
        onClose={() => setSelectedMaterial(null)}
        title={selectedMaterial?.name || 'Document Study Studio'}
        className="max-w-3xl"
      >
        {selectedMaterial && (
          <div>
            {/* Modal Subheader & Actions */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-border">
              <div className="flex items-center gap-2 text-xs text-muted">
                <span>{selectedMaterial.pages} pages</span>
                <span>•</span>
                <span>{selectedMaterial.chunksCount || 0} chunks</span>
                <span>•</span>
                <span className="capitalize">{selectedMaterial.status}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleToggleOfflineCache}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <HardDriveDownload className="h-3.5 w-3.5" />
                  {isCachedOffline ? 'Saved Offline' : 'Save Offline'}
                </Button>
              </div>
            </div>

            {selectedMaterial.status === 'OCR_NEEDED' && (
              <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <h5 className="font-semibold mb-1">OCR Processing Required</h5>
                  <p>
                    This document contains scanned images without a readable digital text layer. Text
                    extraction and AI chunking require an OCR step or an unlocked, digital text PDF.
                  </p>
                </div>
              </div>
            )}

            <div className="mb-6">
              <Tabs
                tabs={[
                  { id: 'summary', label: 'AI Summary' },
                  { id: 'concepts', label: `Key Concepts (${selectedMaterial.keyConcepts?.length || 0})` },
                  { id: 'flashcards', label: `Flashcards (${flashcards.length})` },
                  { id: 'qa', label: 'Document Tutor (Q&A)' },
                  { id: 'quiz', label: 'Practice Quiz' },
                ]}
                activeTab={activeTab}
                onChange={setActiveTab}
              />
            </div>

            <div className="min-h-[340px]">
              {/* TAB 1: AI SUMMARY */}
              {activeTab === 'summary' && (
                <div className="space-y-6">
                  {selectedMaterial.summary?.overview ? (
                    <div>
                      <h4 className="font-semibold text-dark mb-2">Executive Overview</h4>
                      <p className="text-dark/80 text-sm leading-relaxed whitespace-pre-line">
                        {selectedMaterial.summary.overview}
                      </p>
                    </div>
                  ) : (
                    <p className="text-muted text-sm">
                      Summary generated from document chunks and indexed for adaptive learning.
                    </p>
                  )}

                  {selectedMaterial.summary?.keyThemes && selectedMaterial.summary.keyThemes.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-dark mb-3">Key Themes & Page Citations</h4>
                      <div className="space-y-2">
                        {selectedMaterial.summary.keyThemes.map((theme, i) => (
                          <div key={i} className="p-3 bg-gray-50 border border-border rounded-lg text-sm">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-dark">{theme.theme}</span>
                              <div className="flex gap-1">
                                {theme.pages.map((p) => (
                                  <span
                                    key={p}
                                    className="px-2 py-0.5 bg-indigo-50 text-primary font-semibold rounded text-xs"
                                  >
                                    Page {p}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <p className="text-xs text-muted">{theme.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedMaterial.summary?.takeaways && selectedMaterial.summary.takeaways.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-dark mb-2">Core Takeaways</h4>
                      <ul className="space-y-1.5 list-disc pl-5 text-sm text-dark/80">
                        {selectedMaterial.summary.takeaways.map((t, i) => (
                          <li key={i}>
                            {t.text}{' '}
                            <span className="text-xs text-primary font-medium">[Page {t.page}]</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: KEY CONCEPTS */}
              {activeTab === 'concepts' && (
                <div className="space-y-3">
                  {selectedMaterial.keyConcepts && selectedMaterial.keyConcepts.length > 0 ? (
                    selectedMaterial.keyConcepts.map((item, idx) => (
                      <div key={idx} className="p-3.5 bg-white border border-border rounded-xl">
                        <div className="flex items-center justify-between mb-1">
                          <h5 className="font-semibold text-dark text-sm">{item.concept}</h5>
                          <span className="text-xs bg-indigo-50 text-primary font-semibold px-2 py-0.5 rounded">
                            Page {item.pageNumber}
                          </span>
                        </div>
                        <p className="text-sm text-dark/80">{item.definition}</p>
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      icon={BookOpen}
                      title="No concepts extracted"
                      description="Key concepts will appear here once the PDF is processed."
                    />
                  )}
                </div>
              )}

              {/* TAB 3: FLASHCARDS */}
              {activeTab === 'flashcards' && (
                <div>
                  {flashcards.length > 0 ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-xs text-muted">
                        <span>Card {currentCardIndex + 1} of {flashcards.length}</span>
                        <span className="bg-indigo-50 text-primary px-2 py-0.5 rounded font-medium">
                          Source: Page {flashcards[currentCardIndex]?.pageCitation}
                        </span>
                      </div>

                      {/* Interactive Card */}
                      <div
                        onClick={() => setIsCardFlipped(!isCardFlipped)}
                        className={`h-56 p-8 rounded-2xl border cursor-pointer flex flex-col justify-center items-center text-center transition-all transform select-none shadow-sm ${
                          isCardFlipped
                            ? 'bg-indigo-50/50 border-primary text-dark'
                            : 'bg-white border-border text-dark hover:border-primary/50'
                        }`}
                      >
                        <span className="text-xs uppercase font-semibold text-muted mb-2 tracking-wide">
                          {isCardFlipped ? 'Answer / Explanation' : 'Concept / Question'}
                        </span>
                        <p className="text-base font-medium leading-relaxed max-w-lg">
                          {isCardFlipped
                            ? flashcards[currentCardIndex]?.back
                            : flashcards[currentCardIndex]?.front}
                        </p>
                        <span className="text-xs text-muted/60 mt-4 flex items-center gap-1">
                          <RotateCw className="h-3 w-3" /> Click card to flip
                        </span>
                      </div>

                      {/* Flashcard Navigation */}
                      <div className="flex justify-between items-center pt-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={currentCardIndex === 0}
                          onClick={() => {
                            setIsCardFlipped(false);
                            setCurrentCardIndex((prev) => Math.max(prev - 1, 0));
                          }}
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setIsCardFlipped(!isCardFlipped)}
                        >
                          <RotateCw className="h-4 w-4 mr-1" /> Flip Card
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={currentCardIndex === flashcards.length - 1}
                          onClick={() => {
                            setIsCardFlipped(false);
                            setCurrentCardIndex((prev) => Math.min(prev + 1, flashcards.length - 1));
                          }}
                        >
                          Next <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      icon={Layers}
                      title="No flashcards generated"
                      description="Flashcards will be automatically built from this document."
                    />
                  )}
                </div>
              )}

              {/* TAB 4: DOCUMENT TUTOR / Q&A */}
              {activeTab === 'qa' && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ask any question strictly answered by this document..."
                      value={queryInput}
                      onChange={(e) => setQueryInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAskQuestion();
                      }}
                      className="flex-1 px-4 py-2.5 border border-border rounded-btn text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <Button onClick={handleAskQuestion} disabled={isQuerying || !queryInput.trim()}>
                      {isQuerying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                      Ask Tutor
                    </Button>
                  </div>

                  {queryResult && (
                    <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-3">
                      <div>
                        <h5 className="font-semibold text-primary text-xs uppercase tracking-wide mb-1">
                          Source-Grounded Answer
                        </h5>
                        <p className="text-dark/90 text-sm leading-relaxed whitespace-pre-line">
                          {queryResult.answer}
                        </p>
                      </div>

                      {queryResult.citations && queryResult.citations.length > 0 && (
                        <div className="pt-2 border-t border-indigo-100">
                          <span className="text-xs font-semibold text-muted mb-1 block">
                            Document Citations
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {queryResult.citations.map((c, i) => (
                              <div
                                key={i}
                                className="px-2.5 py-1 bg-white border border-indigo-200 rounded-md text-xs text-dark/80"
                                title={c.snippet}
                              >
                                <span className="font-semibold text-primary">Page {c.pageNumber}:</span>{' '}
                                <span className="italic">"{c.snippet.slice(0, 60)}..."</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: PRACTICE QUIZ */}
              {activeTab === 'quiz' && (
                <div className="space-y-6">
                  {quizQuestions.length === 0 ? (
                    <div className="text-center py-10 space-y-4">
                      <p className="text-muted text-sm max-w-md mx-auto">
                        Generate a 4-question multiple-choice quiz strictly based on the facts in this document to test your mastery.
                      </p>
                      <Button onClick={handleGenerateQuiz} disabled={isGeneratingQuiz} size="lg">
                        {isGeneratingQuiz ? 'Generating Quiz Questions...' : 'Start Custom Quiz from Document'}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {quizQuestions.map((q, qIdx) => {
                        const selectedOption = quizAnswers[qIdx];
                        const isCorrect = selectedOption === q.correct;
                        return (
                          <div key={q.id || qIdx} className="p-4 bg-white border border-border rounded-xl space-y-3">
                            <div className="flex items-center justify-between">
                              <h5 className="font-semibold text-dark text-sm">
                                {qIdx + 1}. {q.question}
                              </h5>
                              <span className="text-xs bg-indigo-50 text-primary font-medium px-2 py-0.5 rounded">
                                Page {q.pageCitation}
                              </span>
                            </div>

                            <div className="space-y-2">
                              {q.options.map((opt, optIdx) => {
                                let btnClasses =
                                  'w-full text-left p-2.5 rounded-lg border text-sm transition-all ';
                                if (quizSubmitted) {
                                  if (optIdx === q.correct) {
                                    btnClasses += 'bg-emerald-50 border-emerald-300 text-emerald-800 font-medium';
                                  } else if (selectedOption === optIdx) {
                                    btnClasses += 'bg-red-50 border-red-300 text-red-800';
                                  } else {
                                    btnClasses += 'bg-gray-50 border-gray-200 opacity-60';
                                  }
                                } else {
                                  if (selectedOption === optIdx) {
                                    btnClasses += 'border-primary bg-indigo-50 text-primary font-medium';
                                  } else {
                                    btnClasses += 'border-border hover:border-primary/50';
                                  }
                                }

                                return (
                                  <button
                                    key={optIdx}
                                    type="button"
                                    disabled={quizSubmitted}
                                    className={btnClasses}
                                    onClick={() => setQuizAnswers({ ...quizAnswers, [qIdx]: optIdx })}
                                  >
                                    <span className="font-bold mr-2">{String.fromCharCode(65 + optIdx)}.</span>
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>

                            {quizSubmitted && (
                              <div
                                className={`p-3 rounded-lg text-xs leading-relaxed ${
                                  isCorrect ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                                }`}
                              >
                                <span className="font-bold mr-1">
                                  {isCorrect ? 'Correct!' : 'Incorrect.'}
                                </span>
                                {q.explanation} (Cited from Page {q.pageCitation})
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <div className="flex justify-between items-center pt-2">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setQuizQuestions([]);
                            setQuizAnswers({});
                            setQuizSubmitted(false);
                          }}
                        >
                          Reset Quiz
                        </Button>
                        {!quizSubmitted ? (
                          <Button
                            onClick={handleQuizSubmit}
                            disabled={Object.keys(quizAnswers).length < quizQuestions.length}
                          >
                            Submit Answers
                          </Button>
                        ) : (
                          <Button onClick={handleGenerateQuiz} disabled={isGeneratingQuiz}>
                            Generate New Quiz
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
