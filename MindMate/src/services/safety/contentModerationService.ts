/**
 * MindMate Client-Side Content Safety and Learning Relevance Moderation Service
 * 
 * Fully standalone, deterministic in-browser content moderation engine.
 * ZERO network calls or external dependencies required — guarantees 100% offline safety.
 * 
 * Enforces:
 * 1. Blocking pornographic & sexually explicit content, adult entertainment performers,
 *    and adult platforms (including leetspeak, evasions, and follow-up chains).
 * 2. Unrestricted access to legitimate, non-graphic educational topics in human biology,
 *    anatomy, reproductive health, puberty, STI prevention, and relationship consent.
 * 3. Learning-focused redirects for unproductive celebrity gossip and spam.
 * 4. Pre-filtering visual engine generation and image searches.
 */

export type ModerationDecision =
  | 'ALLOW'
  | 'BLOCK_EXPLICIT_CONTENT'
  | 'REDIRECT_OFF_TOPIC'
  | 'BLOCK_UNSAFE_REQUEST';

export interface ModerationResult {
  decision: ModerationDecision;
  userExplanation: string;
  flaggedCategories: string[];
  isSafeForVisual: boolean;
  isEducational: boolean;
  topic?: string;
}

export interface ConversationTurnContext {
  previousQuestion?: string;
  previousAnswer?: string;
  previousSubject?: string;
  currentSubject?: string;
}

export const MODERATION_EXPLANATIONS = {
  BLOCK_EXPLICIT_CONTENT:
    "MindMate is designed for educational learning. I cannot assist with adult or sexually explicit content. Let's focus on an academic subject, coding topic, or skill you'd like to explore.",
  REDIRECT_OFF_TOPIC:
    "I'm designed to help you learn and build useful skills. Let's focus on a subject, concept, project, or question you'd like to understand.",
  BLOCK_UNSAFE_REQUEST:
    "MindMate is designed for safe educational learning. I cannot assist with harmful, dangerous, or unsafe requests. Let's focus on a constructive learning topic instead."
};

// 1. Adult entertainment performers & public pornographic personalities
const ADULT_PERFORMERS = [
  'johnny sins',
  'jonny sins',
  'john sins',
  'johny sins',
  'jhony sins',
  'steven wolfe',
  'mia khalifa',
  'riley reid',
  'angela white',
  'lana rhoades',
  'danny d',
  'jordi el nino',
  'brandi love',
  'lisa ann',
  'ron jeremy',
  'sasha grey',
  'eva elfie',
  'sunny leone',
  'piper perri',
  'alexis texas',
  'tori black',
  'autumn falls',
  'kendall woods',
  'abella danger',
  'nicole aniston',
  'kendra lust',
  'lelah star',
  'asa akira',
  'jenna jameson',
  'peter north',
  'rocco siffredi'
];

// 2. Adult tube sites, studios, and platforms
const ADULT_PLATFORMS = [
  'pornhub',
  'xvideos',
  'xnxx',
  'brazzers',
  'redtube',
  'youporn',
  'onlyfans',
  'chaturbate',
  'stripchat',
  'cam4',
  'bangbros',
  'naughtyamerica',
  'realitykings',
  'fansly',
  'xhamster',
  'spankbang',
  'eporner',
  'tube8',
  'beeg',
  'fapello',
  'kemono',
  'erome',
  'rule34',
  'hentaihaven',
  'gelbooru'
];

// 3. Pornographic / sexually explicit acts and media
const EXPLICIT_KEYWORDS = [
  'porn',
  'porno',
  'pornography',
  'xxx',
  'nsfw video',
  'erotic video',
  'sex video',
  'nude video',
  'hentai',
  'ecchi',
  'erotica',
  'erotic story',
  'smut',
  'sex tape',
  'adult film',
  'adult movie',
  'hardcore sex',
  'softcore sex',
  'blowjob',
  'handjob',
  'creampie',
  'cumshot',
  'deepthroat',
  'threesome',
  'gangbang',
  'cuckold',
  'erotic massage',
  'cybersex',
  'sexting',
  'send nudes',
  'leaked nudes',
  'pornstar',
  'porn star',
  'adult performer',
  'adult actress',
  'adult actor',
  'masturbat',
  'dildo',
  'fleshlight',
  'fellatio',
  'cunnilingus',
  'anal sex'
];

// 4. Legitimate scientific, biological, health, and relationship education markers
const EDUCATIONAL_BIOLOGY_HEALTH_MARKERS = [
  'reproductive system',
  'male reproductive',
  'female reproductive',
  'uterus',
  'ovaries',
  'ovary',
  'fallopian tube',
  'testes',
  'testicle',
  'scrotum',
  'sperm',
  'sperm cell',
  'egg cell',
  'ovum',
  'gamete',
  'gametes',
  'gametogenesis',
  'fertilization',
  'implantation',
  'placenta',
  'embryo',
  'fetus',
  'gestation',
  'pregnancy',
  'trimester',
  'puberty',
  'secondary sex characteristic',
  'menstruation',
  'menstrual cycle',
  'menstrual',
  'hormone',
  'estrogen',
  'testosterone',
  'progesterone',
  'luteinizing hormone',
  'follicle stimulating',
  'meiosis',
  'mitosis',
  'chromosomes',
  'genetics',
  'human anatomy',
  'human biology',
  'sti',
  'stis',
  'std',
  'stds',
  'sexually transmitted',
  'hiv',
  'aids',
  'hpv',
  'herpes',
  'syphilis',
  'gonorrhea',
  'chlamydia',
  'contraception',
  'contraceptive',
  'condom',
  'condoms',
  'birth control',
  'transmission prevention',
  'safe sex',
  'sexual health',
  'consent',
  'personal boundaries',
  'healthy relationship',
  'mutual respect'
];

// 5. Unsafe / Dangerous requests
const DANGEROUS_PATTERNS = [
  /\b(build|make|create|synthesize)\s+(a\s+)?(bomb|explosive|ied|dirty bomb|landmine)\b/i,
  /\b(how to (make|create))\s+(meth|methamphetamine|fentanyl|heroin|ricin|sarin)\b/i,
  /\b(how to commit suicide|kill myself|suicide instructions|self harm tutorial)\b/i,
  /\b(write|create|generate)\s+(a\s+)?(keylogger|ransomware|trojan|ddos attack script|malware exploit)\b/i
];

// 6. Celebrity gossip / spam patterns
const GOSSIP_SPAM_PATTERNS = [
  /\b(kardashian|jenner|hollywood drama|celebrity gossip|who is dating who|who dated who)\b/i,
  /\b(roast my friend|insult my teacher|give me bad cuss words)\b/i
];

/**
 * Normalizes text to defeat simple leetspeak and obfuscation tricks
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  let cleaned = text.toLowerCase();

  // Handle blowjob variants before generic substitutions
  cleaned = cleaned.replace(/b[!1i|]ow/g, 'blow');

  // De-obfuscate common leetspeak substitutions
  cleaned = cleaned
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/!/g, 'i')
    .replace(/ph/g, 'f');

  // Strip non-alphanumeric except spaces
  cleaned = cleaned.replace(/[^a-z0-9\s]/g, ' ');

  // Collapse repeated consecutive characters (preserve xxx)
  cleaned = cleaned.replace(/([^x])\1{2,}/g, '$1$1');

  // Collapse multiple spaces
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Evaluates whether text matches adult entertainer / pornographic entity patterns
 */
function matchesAdultPerformer(normalized: string): boolean {
  for (const performer of ADULT_PERFORMERS) {
    const regex = new RegExp(`(^|\\s)${performer.replace(/\s+/g, '\\s+')}(\\s|$)`, 'i');
    if (regex.test(normalized)) {
      return true;
    }
  }

  if (
    normalized.includes('johnny sin') ||
    normalized.includes('jonny sin') ||
    normalized.includes('john sin') ||
    normalized.includes('steven wolfe') ||
    normalized.includes('mia khalifa') ||
    normalized.includes('riley reid') ||
    normalized.includes('angela white') ||
    normalized.includes('lana rhoades')
  ) {
    return true;
  }

  return false;
}

/**
 * Evaluates whether text matches adult platforms or explicit keywords
 */
function matchesExplicitKeywordsOrPlatforms(normalized: string, rawText = ''): boolean {
  const rawLower = rawText.toLowerCase();
  if (rawLower.includes('xxx') || rawLower.includes('blowjob') || rawLower.includes('b!owjob')) {
    return true;
  }

  for (const platform of ADULT_PLATFORMS) {
    if (normalized.includes(platform) || rawLower.includes(platform)) {
      return true;
    }
  }

  for (const kw of EXPLICIT_KEYWORDS) {
    const regex = new RegExp(`(^|\\s)${kw.replace(/\s+/g, '\\s+')}(\\s|$)`, 'i');
    if (regex.test(normalized) || regex.test(rawLower)) {
      return true;
    }
  }

  return false;
}

/**
 * Detects whether the text is a legitimate educational or scientific inquiry
 */
function hasLegitimateEducationalContext(normalized: string): boolean {
  for (const marker of EDUCATIONAL_BIOLOGY_HEALTH_MARKERS) {
    if (normalized.includes(marker)) {
      return true;
    }
  }
  return false;
}

/**
 * Detects follow-up action keywords
 */
export function isFollowUpAction(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    lower.includes('explain differently') ||
    lower.includes('simplify') ||
    lower.includes('give example') ||
    lower.includes('quiz me') ||
    lower.includes('show visually') ||
    lower.includes('tell me more') ||
    lower.includes('continue') ||
    lower.startsWith('why?') ||
    lower.startsWith('how?') ||
    lower === 'again' ||
    lower === 'more'
  );
}

/**
 * Central content moderation evaluator
 */
export function evaluateContentModeration(
  prompt: string,
  context?: ConversationTurnContext
): ModerationResult {
  const trimmed = prompt.trim();
  const normalized = normalizeText(trimmed);

  // Check dangerous / harm requests
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed) || pattern.test(normalized)) {
      return {
        decision: 'BLOCK_UNSAFE_REQUEST',
        userExplanation: MODERATION_EXPLANATIONS.BLOCK_UNSAFE_REQUEST,
        flaggedCategories: ['dangerous_harmful_content'],
        isSafeForVisual: false,
        isEducational: false
      };
    }
  }

  // Evaluate context for follow-up prompts
  const isFollowUp = isFollowUpAction(trimmed);
  let relevantPreviousSubject = '';

  if (context?.previousQuestion) {
    relevantPreviousSubject = context.previousSubject || context.previousQuestion;
  }

  // Check if target involves adult entertainer
  const hasPerformerInPrompt = matchesAdultPerformer(normalized);
  const hasPerformerInContext = context?.previousQuestion
    ? matchesAdultPerformer(normalizeText(context.previousQuestion))
    : false;

  if (hasPerformerInPrompt || (isFollowUp && hasPerformerInContext)) {
    return {
      decision: 'BLOCK_EXPLICIT_CONTENT',
      userExplanation: MODERATION_EXPLANATIONS.BLOCK_EXPLICIT_CONTENT,
      flaggedCategories: ['adult_entertainment_personality'],
      isSafeForVisual: false,
      isEducational: false,
      topic: 'Adult Entertainment'
    };
  }

  // Check if target matches explicit keywords or platforms
  const hasExplicitInPrompt = matchesExplicitKeywordsOrPlatforms(normalized, trimmed);
  const hasExplicitInContext = context?.previousQuestion
    ? matchesExplicitKeywordsOrPlatforms(normalizeText(context.previousQuestion), context.previousQuestion)
    : false;

  if (hasExplicitInPrompt || (isFollowUp && hasExplicitInContext)) {
    // Check if this is a legitimate biology/anatomy/health inquiry without pornographic intent
    const isEducationalBiology = hasLegitimateEducationalContext(normalized);

    const containsPlatform = ADULT_PLATFORMS.some((p) => normalized.includes(p) || trimmed.toLowerCase().includes(p));
    const isGraphicRequest =
      normalized.includes('erotic') ||
      normalized.includes('porn') ||
      trimmed.toLowerCase().includes('xxx') ||
      normalized.includes('xxx') ||
      normalized.includes('blowjob') ||
      trimmed.toLowerCase().includes('blowjob') ||
      trimmed.toLowerCase().includes('b!owjob') ||
      normalized.includes('handjob') ||
      normalized.includes('creampie') ||
      normalized.includes('send nudes');

    if (isEducationalBiology && !containsPlatform && !isGraphicRequest) {
      return {
        decision: 'ALLOW',
        userExplanation: '',
        flaggedCategories: [],
        isSafeForVisual: true,
        isEducational: true,
        topic: 'Human Biology and Health'
      };
    }

    return {
      decision: 'BLOCK_EXPLICIT_CONTENT',
      userExplanation: MODERATION_EXPLANATIONS.BLOCK_EXPLICIT_CONTENT,
      flaggedCategories: ['sexually_explicit_content'],
      isSafeForVisual: false,
      isEducational: false,
      topic: 'Explicit Content'
    };
  }

  // Check for off-topic celebrity gossip or spam
  for (const pattern of GOSSIP_SPAM_PATTERNS) {
    if (pattern.test(trimmed) || pattern.test(normalized)) {
      return {
        decision: 'REDIRECT_OFF_TOPIC',
        userExplanation: MODERATION_EXPLANATIONS.REDIRECT_OFF_TOPIC,
        flaggedCategories: ['off_topic_entertainment'],
        isSafeForVisual: false,
        isEducational: false,
        topic: 'Off-Topic'
      };
    }
  }

  // Check for repeated spam characters / gibberish
  if (
    normalized.includes('asdfghjkl') ||
    normalized.includes('qwertyuiop') ||
    normalized.includes('zxcvbnm') ||
    /^([a-z])\1{3,}$/.test(normalized) ||
    /^([a-z]{1,15})\1{1,}$/.test(normalized.replace(/\s/g, ''))
  ) {
    return {
      decision: 'REDIRECT_OFF_TOPIC',
      userExplanation: MODERATION_EXPLANATIONS.REDIRECT_OFF_TOPIC,
      flaggedCategories: ['unproductive_spam'],
      isSafeForVisual: false,
      isEducational: false,
      topic: 'Spam'
    };
  }

  // All other legitimate academic, programming, scientific, historical inquiries
  return {
    decision: 'ALLOW',
    userExplanation: '',
    flaggedCategories: [],
    isSafeForVisual: true,
    isEducational: true,
    topic: relevantPreviousSubject || undefined
  };
}

export class ContentModerationService {
  public evaluate(prompt: string, context?: ConversationTurnContext): ModerationResult {
    return evaluateContentModeration(prompt, context);
  }

  public isVisualSearchPermitted(query: string, context?: ConversationTurnContext): boolean {
    const res = evaluateContentModeration(query, context);
    return res.decision === 'ALLOW' && res.isSafeForVisual;
  }

  public isFollowUpAction(text: string): boolean {
    return isFollowUpAction(text);
  }
}

export const contentModerationService = new ContentModerationService();
