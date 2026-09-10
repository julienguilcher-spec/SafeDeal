/**
 * Ideal Candidate Profile (ICP) for the cofounder / first-hire search.
 *
 * Edit this file to tune who the bot looks for. Everything here is read by
 * both the pre-filter (cheap keyword heuristics) and the Claude scorer
 * (the rubric is rendered into the system prompt).
 */

export const ICP = {
  role: "Cofounder or first employee (business / operations lead) for a new business + AI school in France, similar to Albert School but with a more business-oriented vibe.",

  /** Hard-ish requirements. Claude flags violations; the pipeline demotes them. */
  must: [
    "French (nationality or clearly French background: French schools, French name + Paris-based, etc.)",
    "Roughly 25 to 40 years old (estimate from graduation year or career length)",
    "Based in France, or willing to be (Paris-based strongly preferred)",
  ],

  /** Signals that make a strong profile. Any 2+ of these is a good candidate. */
  strongSignals: [
    "Graduated from a top French business school (HEC, ESSEC, ESCP, EDHEC, EM Lyon) or top engineering school (Polytechnique, CentraleSupelec, Mines Paris, Ponts, Telecom Paris, ENS, ENSAE)",
    "Ex-cofounder of a tech and/or education startup",
    "Ex-Anthropic, Google, DeepMind, OpenAI, Mistral, Hugging Face (or comparable AI lab)",
    "Ex-education company: Le Wagon, Albert School, Ironhack, OpenClassrooms, Jedha, Hectar, Ecole 42, Station F programs, Eurecia, Rocket School, Schoolab, Wild Code School",
    "Ex-top consulting (McKinsey, BCG, Bain) or ex-VC / ex-startup COO/CBO with a strong business track record",
    "Has built or run a program, bootcamp, cohort, or community (evidence of go-to-market + operational execution)",
  ],

  /** Things that lower the score. */
  negatives: [
    "Pure academic researcher with no business or operating experience",
    "Currently a senior executive at a big corporation with no startup exposure (unlikely to leave for a cofounder role)",
    "Purely technical profile with no interest in business, sales, or education",
    "Not French / no link to France",
    "Clearly outside the 25-40 age range",
  ],

  /** Keyword lists reused by the pre-filter and the search recipes. */
  keywords: {
    schools: [
      "HEC", "ESSEC", "ESCP", "EDHEC", "EM Lyon", "emlyon", "Polytechnique", "CentraleSupélec", "CentraleSupelec",
      "Mines Paris", "Mines ParisTech", "Ponts", "Télécom Paris", "Telecom Paris", "ENS", "ENSAE", "Sciences Po",
    ],
    aiLabs: ["Anthropic", "Google", "DeepMind", "OpenAI", "Mistral", "Hugging Face"],
    eduCompanies: [
      "Le Wagon", "Albert School", "Ironhack", "OpenClassrooms", "Jedha", "Hectar", "42", "Rocket School",
      "Schoolab", "Wild Code School", "Eurecia", "Station F",
    ],
    founderTitles: ["cofounder", "co-founder", "cofondateur", "cofondatrice", "founder", "fondateur", "fondatrice", "CEO", "COO", "CBO"],
  },
} as const;

/**
 * Search recipes. Each recipe is one query shape sent to the sources.
 * The runner rotates through them day after day so that a 2-month campaign
 * keeps surfacing new people instead of the same top results.
 *
 * `google` is the free-text query for Google Programmable Search
 * (restricted to linkedin.com/in by the source). `apollo` are the
 * filters for the Apollo People Search API.
 */
export interface SearchRecipe {
  id: string;
  label: string;
  google: string;
  apollo?: {
    keywords: string;
    titles?: string[];
  };
}

export const RECIPES: SearchRecipe[] = [
  {
    id: "ex-lewagon-founder",
    label: "Ex Le Wagon devenu·e founder",
    google: '"Le Wagon" (cofondateur OR cofounder OR "co-founder" OR CEO OR COO) Paris',
    apollo: { keywords: "Le Wagon", titles: ["Founder", "Co-Founder", "CEO", "COO"] },
  },
  {
    id: "ex-albert-school",
    label: "Ex Albert School / écoles business+data",
    google: '("Albert School" OR "Jedha" OR "Hectar" OR "Rocket School") (Head OR Director OR Lead OR cofounder OR COO) Paris',
    apollo: { keywords: "Albert School OR Jedha OR Hectar", titles: ["Head", "Director", "Co-Founder", "COO", "Chief"] },
  },
  {
    id: "ex-ai-lab-french",
    label: "Français·e ex AI lab (Anthropic / DeepMind / OpenAI / Mistral)",
    google: '(Anthropic OR DeepMind OR OpenAI OR "Mistral AI") (HEC OR Polytechnique OR CentraleSupélec OR ESSEC OR ESCP OR "Télécom Paris") Paris',
    apollo: { keywords: "Anthropic OR DeepMind OR OpenAI OR Mistral" },
  },
  {
    id: "ex-google-gtm-french",
    label: "Français·e ex Google (GTM / strategy / partnerships)",
    google: 'Google (HEC OR ESSEC OR ESCP OR EDHEC OR "EM Lyon") ("business development" OR partnerships OR strategy OR "go-to-market") Paris',
    apollo: { keywords: "Google HEC OR ESSEC OR ESCP", titles: ["Business Development", "Partnerships", "Strategy", "Go-to-Market"] },
  },
  {
    id: "edtech-cofounder-exit",
    label: "Cofondateur·rice edtech (exit ou en transition)",
    google: '(edtech OR "education" OR "formation") (cofondateur OR cofounder OR "co-founder") (HEC OR ESSEC OR ESCP OR Polytechnique OR CentraleSupélec) Paris',
    apollo: { keywords: "edtech education cofounder", titles: ["Co-Founder", "Founder"] },
  },
  {
    id: "consulting-to-startup",
    label: "Ex McKinsey / BCG / Bain devenu·e COO/CBO de startup",
    google: '(McKinsey OR BCG OR Bain) (COO OR CBO OR "Chief of Staff" OR "Head of Operations") startup (HEC OR ESSEC OR ESCP OR Polytechnique) Paris',
    apollo: { keywords: "McKinsey OR BCG OR Bain startup", titles: ["COO", "Chief Business Officer", "Chief of Staff", "Head of Operations"] },
  },
  {
    id: "bootcamp-program-lead",
    label: "Head of Program / bootcamp / community",
    google: '("Head of Program" OR "Program Director" OR "Head of Community" OR "Head of Admissions") (bootcamp OR école OR school OR "campus") Paris',
    apollo: { keywords: "bootcamp school program", titles: ["Head of Program", "Program Director", "Head of Community", "Head of Admissions"] },
  },
  {
    id: "ai-startup-business-cofounder",
    label: "Cofondateur·rice business d'une startup IA",
    google: '("startup IA" OR "AI startup" OR "GenAI") (cofondateur OR cofounder OR "co-founder") (HEC OR ESSEC OR ESCP OR EDHEC) Paris',
    apollo: { keywords: "AI startup cofounder", titles: ["Co-Founder", "Founder", "CEO"] },
  },
  {
    id: "ex-openclassrooms-ironhack",
    label: "Ex OpenClassrooms / Ironhack / Wild Code School",
    google: '(OpenClassrooms OR Ironhack OR "Wild Code School" OR "École 42") (Head OR Director OR VP OR Lead OR cofounder) Paris',
    apollo: { keywords: "OpenClassrooms OR Ironhack OR Wild Code School", titles: ["Head", "Director", "VP", "Co-Founder"] },
  },
  {
    id: "vc-entrepreneur-in-residence",
    label: "EIR / ex-VC cherchant un projet",
    google: '("Entrepreneur in Residence" OR "EIR" OR "en réflexion" OR "next adventure" OR "nouveau projet") (HEC OR ESSEC OR ESCP OR Polytechnique OR CentraleSupélec) Paris',
    apollo: { keywords: "Entrepreneur in Residence", titles: ["Entrepreneur in Residence", "EIR"] },
  },
];
