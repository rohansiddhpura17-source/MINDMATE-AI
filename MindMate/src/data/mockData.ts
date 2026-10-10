import { Learner, Topic, WeeklyData, QuizQuestion, Friend, Material, Insight, PlannerDayData, ChatMessage } from '../types';

export const learner: Learner = {
  name: 'Alex',
  goal: 'Computer Science Final Exam',
  streak: 12,
  overallMastery: 72,
  learningEfficiency: 84,
  retention: 87,
  weeklyLearning: '4h 20m',
  recentAccuracy: 80,
  preferredSession: '30–45 min',
  learningStyle: 'Examples first',
  strongest: 'DBMS',
  weakest: 'OOP',
};

export const topics: Topic[] = [
  { name: 'Variables', mastery: 92, status: 'mastered' },
  { name: 'Conditions', mastery: 86, status: 'strong' },
  { name: 'Loops', mastery: 61, status: 'developing' },
  { name: 'Functions', mastery: 48, status: 'needs-work' },
  { name: 'OOP', mastery: 31, status: 'critical' },
  { name: 'DBMS', mastery: 82, status: 'strong' },
];

export const weeklyData: WeeklyData[] = [
  { day: 'Mon', minutes: 45 },
  { day: 'Tue', minutes: 30 },
  { day: 'Wed', minutes: 60 },
  { day: 'Thu', minutes: 25 },
  { day: 'Fri', minutes: 50 },
  { day: 'Sat', minutes: 35 },
  { day: 'Sun', minutes: 15 },
];

export const quizQuestions: QuizQuestion[] = [
  {
    id: 1,
    question: 'What happens when a function is called with a missing required argument?',
    options: [
      'The function runs with None for the missing argument',
      'Python raises a TypeError',
      'Python raises a ValueError',
      'The function is skipped silently',
    ],
    correct: 1,
    explanation: 'Python raises a TypeError because a required positional argument was not provided.',
    topic: 'Functions',
  },
  {
    id: 2,
    question: 'What is the output of: def f(x, y=10): return x + y — called as f(5)?',
    options: ['Error', '5', '15', '10'],
    correct: 2,
    explanation: 'y defaults to 10, so f(5) returns 5 + 10 = 15. This is a default argument.',
    topic: 'Default Arguments',
  },
  {
    id: 3,
    question: 'Which keyword is used to define a function in Python?',
    options: ['function', 'def', 'func', 'define'],
    correct: 1,
    explanation: 'The def keyword is used to define functions in Python.',
    topic: 'Functions',
  },
  {
    id: 4,
    question: 'What does *args allow in a function definition?',
    options: [
      'Only keyword arguments',
      'A fixed number of arguments',
      'Variable number of positional arguments',
      'No arguments',
    ],
    correct: 2,
    explanation: '*args allows a function to accept any number of positional arguments as a tuple.',
    topic: 'Variable Arguments',
  },
  {
    id: 5,
    question: 'What is a lambda function?',
    options: [
      'A function with no return value',
      'A built-in Python function',
      'An anonymous single-expression function',
      'A recursive function',
    ],
    correct: 2,
    explanation: 'Lambda functions are anonymous functions defined with a single expression.',
    topic: 'Lambda',
  },
];

export const friends: Friend[] = [
  { id: 1, name: 'Sarah K.', streak: 8, subject: 'Data Structures', avatar: 'SK', mastery: 68 },
  { id: 2, name: 'Ravi M.', streak: 15, subject: 'Algorithms', avatar: 'RM', mastery: 75 },
  { id: 3, name: 'Priya L.', streak: 5, subject: 'OOP', avatar: 'PL', mastery: 62 },
];

export const materials: Material[] = [
  { id: 1, name: 'Python Programming Notes', type: 'PDF', status: 'processed', pages: 24, date: '2 days ago' },
  { id: 2, name: 'Database Systems Notes', type: 'PDF', status: 'ready', pages: 18, date: '5 days ago' },
  { id: 3, name: 'OOP Concepts Summary', type: 'Text', status: 'processed', pages: 8, date: '1 week ago' },
];

export const insights: Insight[] = [
  {
    id: 1,
    type: 'mistake',
    title: 'Repeated mistake pattern detected',
    description: "You've made the same mistake three times on default arguments. MindMate has queued a focused review.",
    action: 'Review concept',
    icon: 'AlertCircle',
    color: 'warning',
  },
  {
    id: 2,
    type: 'behavior',
    title: 'Performance drops in long sessions',
    description: 'Your accuracy drops by 23% after 45+ minute sessions. Shorter focused sessions improve your retention.',
    action: 'Adjust schedule',
    icon: 'TrendingDown',
    color: 'danger',
  },
  {
    id: 3,
    type: 'mastery',
    title: 'DBMS topic mastered',
    description: 'You have reached 82% mastery in DBMS. MindMate recommends increasing the difficulty.',
    action: 'Increase difficulty',
    icon: 'Trophy',
    color: 'success',
  },
];

export const plannerDays: PlannerDayData[] = [
  { day: 'Mon', tasks: [{ name: 'Python Functions', duration: '25 min', type: 'practice' }] },
  { day: 'Tue', tasks: [{ name: 'OOP Recovery', duration: '30 min', type: 'recovery' }] },
  { day: 'Wed', tasks: [{ name: 'DBMS Review', duration: '25 min', type: 'review' }] },
  { day: 'Thu', tasks: [{ name: 'Quiz Session', duration: '20 min', type: 'quiz' }] },
  { day: 'Fri', tasks: [{ name: 'Mock Assessment', duration: '40 min', type: 'assessment' }] },
];

export const chatMessages: ChatMessage[] = [
  {
    id: 1,
    role: 'user',
    content: 'Explain function arguments.',
  },
  {
    id: 2,
    role: 'assistant',
    content: 'Since you learn best through examples, let\'s start with a simple one.',
    code: `def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"

# Calling with both arguments
greet("Alex", "Hi")   # → "Hi, Alex!"

# Using the default value
greet("Alex")          # → "Hello, Alex!"`,
    explanation: 'Here, name is a **required argument** — you must always provide it. greeting is a **default argument** — it already has a value, so it\'s optional. This is how Python functions let you be flexible without repeating yourself.',
  },
];
