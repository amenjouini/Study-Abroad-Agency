import type { ApplicationFacts, CaseFacts, SponsorFacts } from "../../src/lib/engine/types";

export function makeApplication(overrides: Partial<ApplicationFacts> = {}): ApplicationFacts {
  return {
    id: "app-florence",
    label: "University of Florence",
    status: "PREPARING",
    university: { id: "uni-florence", name: "University of Florence" },
    program: { id: "prog-florence-msc", name: "MSc Data Science", degreeLevel: "MASTER", language: "EN", durationMonths: 24 },
    visa: null,
    ...overrides,
  };
}

export function makeSponsor(overrides: Partial<SponsorFacts> = {}): SponsorFacts {
  return {
    id: "sp-father",
    label: "Father",
    relationship: "FATHER",
    professionalStatus: "EMPLOYEE",
    pensionFund: null,
    ...overrides,
  };
}

export function makeFacts(overrides: Partial<CaseFacts> = {}): CaseFacts {
  return {
    caseId: "case-1",
    today: "2026-09-26",
    student: {
      id: "student-1",
      nationality: "TN",
      passportExpiry: "2030-01-01",
      desiredDegreeLevel: "MASTER",
      studyLanguage: "EN",
      degreeLevels: ["BACHELOR"],
    },
    sponsors: [makeSponsor()],
    fundingSources: [],
    applications: [makeApplication()],
    scholarships: [],
    plannedSubmissionDate: "2026-11-01",
    ...overrides,
  };
}
