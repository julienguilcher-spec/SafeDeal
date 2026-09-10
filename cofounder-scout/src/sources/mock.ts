import type { SearchRecipe } from "../icp.js";
import type { RawCandidate, Source } from "./types.js";

/** Fixture source so the whole pipeline can be exercised without API keys. */
const FIXTURES: Omit<RawCandidate, "recipeId">[] = [
  {
    key: "https://www.linkedin.com/in/mock-lea-martin",
    name: "Léa Martin",
    headline: "Ex-COO Le Wagon Paris · HEC 2014 · Building something new in education",
    details: "Employment history: COO @ Le Wagon (2019-2024); Consultant @ BCG (2015-2019)",
    linkedinUrl: "https://www.linkedin.com/in/mock-lea-martin",
    location: "Paris, France",
    currentCompany: "Independent",
    currentTitle: "Entrepreneur in Residence",
    source: "mock",
  },
  {
    key: "https://www.linkedin.com/in/mock-thomas-durand",
    name: "Thomas Durand",
    headline: "Cofounder & CEO @ EdTech startup (exited) · Polytechnique X2012 · ex-Google",
    details: "Employment history: Cofounder @ Learnly (2018-2024, acquired); Product Manager @ Google (2015-2018)",
    linkedinUrl: "https://www.linkedin.com/in/mock-thomas-durand",
    location: "Paris, France",
    source: "mock",
  },
  {
    key: "https://www.linkedin.com/in/mock-john-smith",
    name: "John Smith",
    headline: "Senior Research Scientist @ DeepMind · PhD Cambridge",
    details: "Employment history: Research Scientist @ DeepMind (2016-now)",
    linkedinUrl: "https://www.linkedin.com/in/mock-john-smith",
    location: "London, United Kingdom",
    source: "mock",
  },
  {
    key: "https://www.linkedin.com/in/mock-camille-bernard",
    name: "Camille Bernard",
    headline: "Head of Program @ Albert School · ESSEC 2016",
    details: "Employment history: Head of Program @ Albert School (2022-now); Program Manager @ Station F (2019-2022)",
    linkedinUrl: "https://www.linkedin.com/in/mock-camille-bernard",
    location: "Paris, France",
    source: "mock",
  },
  {
    key: "https://www.linkedin.com/in/mock-pierre-lefevre",
    name: "Pierre Lefèvre",
    headline: "Directeur Général @ Groupe industriel du CAC 40 · ESCP 1992",
    details: "Employment history: DG @ BigCorp (2010-now)",
    linkedinUrl: "https://www.linkedin.com/in/mock-pierre-lefevre",
    location: "Paris, France",
    source: "mock",
  },
  {
    key: "https://www.linkedin.com/in/mock-ines-moreau",
    name: "Inès Moreau",
    headline: "Go-to-Market Lead @ Mistral AI · CentraleSupélec 2017 · ex-McKinsey",
    details: "Employment history: GTM Lead @ Mistral AI (2023-now); Associate @ McKinsey (2019-2023)",
    linkedinUrl: "https://www.linkedin.com/in/mock-ines-moreau",
    location: "Paris, France",
    source: "mock",
  },
];

export const mockSource: Source = {
  name: "mock",
  enabled: true,
  async search(recipe: SearchRecipe, page: number): Promise<RawCandidate[]> {
    if (page > 1) return [];
    return FIXTURES.map((f) => ({ ...f, recipeId: recipe.id }));
  },
};
