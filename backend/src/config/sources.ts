export interface QuestionSource {
  id: string;
  name: string;
  url: string;
  type?: "github" | "web"; // Optional type hint (auto-detected if not specified)
  description?: string;
  filePattern?: RegExp;
}

export const QUESTION_SOURCES: QuestionSource[] = [
  // GitHub sources
  {
    id: "javascript-interview",
    name: "JavaScript Interview Questions",
    url: "https://raw.githubusercontent.com/sudheerj/javascript-interview-questions/master/README.md",
    type: "github",
  },
  // Uncomment to add more GitHub sources:
  // {
  //   id: "backend-interview",
  //   name: "Back-End Developer Interview Questions",
  //   url: "https://raw.githubusercontent.com/arialdomartini/Back-End-Developer-Interview-Questions/master/README.md",
  //   type: "github",
  // },

  // Example: Web sources (blogs, documentation, etc.)
  // Uncomment to add web sources:
  // {
  //   id: "web-example-1",
  //   name: "Understanding React Hooks",
  //   url: "https://overreacted.io/a-complete-guide-to-useeffect/",
  //   type: "web",
  //   description: "Dan Abramov's guide to useEffect",
  // },
];

export function getSourceById(id: string): QuestionSource | undefined {
  return QUESTION_SOURCES.find((source) => source.id === id);
}

export function getAllSources(): QuestionSource[] {
  return QUESTION_SOURCES;
}
