export interface QuestionSource {
  id: string;
  name: string;
  url: string;
  filePattern?: RegExp;
}

export const QUESTION_SOURCES: QuestionSource[] = [
  {
    id: 'backend-interview',
    name: 'Back-End Developer Interview Questions',
    url: 'https://raw.githubusercontent.com/arialdomartini/Back-End-Developer-Interview-Questions/master/README.md',
  },
  // Add more sources as needed
];

export function getSourceById(id: string): QuestionSource | undefined {
  return QUESTION_SOURCES.find(source => source.id === id);
}

export function getAllSources(): QuestionSource[] {
  return QUESTION_SOURCES;
}
