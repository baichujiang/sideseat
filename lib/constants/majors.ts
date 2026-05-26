/**
 * Curated lists of TUM degree programs, scraped from the official program
 * catalogue (https://www.tum.de/en/studies/degree-programs). Kept as static
 * constants so the profile editor can offer consistent suggestions while still
 * allowing students to type their exact program name.
 *
 * If TUM publishes new programs, append them here. Saved custom values do not
 * need to match this list.
 */

import type { DegreeLevel } from "@prisma/client";

export const DEGREE_LEVELS = ["BACHELOR", "MASTER", "OTHER"] as const;

export const DEGREE_LEVEL_LABELS: Record<DegreeLevel, string> = {
  BACHELOR: "Bachelor",
  MASTER: "Master",
  OTHER: "Other (State exam, certificate, …)",
};

export const BACHELOR_MAJORS = [
  "Aerospace",
  "Agricultural Sciences and Horticultural Sciences",
  "Architecture",
  "Biochemistry",
  "Bioeconomics",
  "Bioeconomy",
  "Biogenic Materials",
  "Bioinformatics",
  "Brewing and Beverage Technology",
  "Chemical Biotechnology",
  "Chemical Engineering",
  "Chemistry",
  "Civil Engineering",
  "Electrical Engineering and Information Technology",
  "Electronics and Data Engineering",
  "Engineering and Materials Science",
  "Engineering Science",
  "Environmental Engineering",
  "Food Chemistry",
  "Food Technology",
  "Forest Science and Resource Management",
  "Geodesy and Geoinformation",
  "Geosciences",
  "Health Science",
  "Informatics",
  "Informatics: Games Engineering",
  "Information Engineering (Heilbronn)",
  "Information Systems",
  "Landscape Architecture and Landscape Planning",
  "Life Sciences Biology",
  "Life Sciences Nutrition",
  "Management and Data Science",
  "Management and Technology (Heilbronn)",
  "Management and Technology (Munich)",
  "Mathematics",
  "Mechanical Engineering",
  "Molecular Biotechnology",
  "Pharmaceutical Bioprocess Engineering",
  "Physics",
  "Political Science",
  "Sport Science",
  "Sustainable Engineering for Materials and Processes",
  "Sustainable Management and Technology",
  "Teaching at Academic Secondary Schools – Scientific Education",
  "Technology of Biogenic Resources",
  "Vocational Education Agriculture",
  "Vocational Education Electrical Engineering and Information Technology",
  "Vocational Education Health and Health Care Science",
  "Vocational Education Metal Engineering",
  "Vocational Education Nutrition and Home Economics",
  "Vocational Education Structural Engineering",
] as const;

export const MASTER_MAJORS = [
  "Aerospace",
  "Aerospace Engineering (Singapore)",
  "Agricultural Biosciences",
  "AgriFood Economics, Policy and Regulation",
  "Agrosystem Sciences",
  "AI in Biomedicine",
  "AI in Society",
  "Architecture",
  "Automotive Engineering",
  "Biochemistry",
  "Bioeconomy",
  "Bioinformatics",
  "Biology",
  "Biomass Technology",
  "Biomedical Engineering and Medical Physics",
  "Biomedical Neuroscience",
  "Brewing and Beverage Technology",
  "Business Education I",
  "Business Education II (with second teaching subject)",
  "Cartography",
  "Chemical Biotechnology",
  "Chemical Engineering",
  "Chemistry",
  "Civil Engineering",
  "Communications and Electronics Engineering",
  "Computational Mechanics",
  "Computational Science and Engineering (CSE)",
  "Conservation and Landscape Planning",
  "Consumer Science",
  "Data & Society",
  "Data Engineering and Analytics",
  "Development, Production and Management in Mechanical Engineering",
  "Ecological Engineering",
  "Electrical Engineering and Information Technology",
  "Energy and Process Engineering",
  "Engineering Geology and Hydrogeology",
  "Environmental Engineering",
  "ESPACE – Earth Oriented Space Science and Technology",
  "Executive MBA in Business & IT",
  "Executive MBA in General Management",
  "Executive MBA in Innovation and Business Creation",
  "Finance and Information Management (FIM)",
  "Food Chemistry",
  "Food Technology",
  "Forest and Wood Science",
  "Geodesy and Geoinformation",
  "Geomaterials and Geochemistry",
  "Geophysics",
  "GeoThermie / GeoEnergie",
  "Green Electronics",
  "Health Science – Prevention and Health Promotion",
  "Human Factors Engineering",
  "Industrial Biotechnology",
  "Industrial Chemistry",
  "Informatics",
  "Informatics: Games Engineering",
  "Information Engineering (Heilbronn)",
  "Information Systems",
  "Information Technologies for the Built Environment",
  "Integrated Circuit Design",
  "Land Management and Geospatial Science",
  "Landscape Architecture",
  "Lehramt an beruflichen Schulen – Berufliche Bildung Integriert",
  "Logistics Engineering and Management",
  "Management (Heilbronn)",
  "Management (Munich)",
  "Management and Digital Technology",
  "Management and Innovation",
  "Management and Technology",
  "Materials Science and Engineering",
  "Mathematical Finance and Actuarial Science",
  "Mathematics",
  "Mathematics in Data Science",
  "Mathematics in Science and Engineering",
  "Mechanical Engineering",
  "Mechatronics, Robotics and Biomechanical Engineering",
  "Medical Engineering",
  "Microelectronics and Chip Design",
  "Molecular Biotechnology",
  "Neuroengineering",
  "Nutrition and Biomedicine",
  "Pharmaceutical Bioprocess Engineering",
  "Physics (Applied and Engineering Physics)",
  "Physics (Biophysics)",
  "Physics (Condensed Matter Physics)",
  "Physics (Nuclear, Particle and Astrophysics)",
  "Politics & Technology",
  "Power Engineering",
  "Quantum Science & Technology",
  "Radiation Biology",
  "Rail and Urban Transport",
  "Resource Efficient and Sustainable Building",
  "Responsibility in Science, Engineering and Technology (RESET)",
  "Risk and Safety",
  "Robotics, Cognition, Intelligence",
  "Science and Technology of Materials (STM)",
  "Science and Technology Studies (STS)",
  "Software Engineering",
  "Sport and Exercise Science",
  "Sustainable Energy and Processes",
  "Sustainable Food",
  "Sustainable Management and Technology",
  "Sustainable Real Estate",
  "Sustainable Resource Management",
  "Teaching at Academic Secondary Schools – Scientific Education",
  "Technology of Biogenic Resources",
  "Transportation Systems",
  "Urbanism – Urban and Landscape Studies and Design",
  "Vocational Education Agriculture",
  "Vocational Education and Innovation",
  "Vocational Education Electrical Engineering and Information Technology",
  "Vocational Education Health and Health Care Science",
  "Vocational Education Metal Engineering",
  "Vocational Education Nutrition and Home Economics",
  "Vocational Education Structural Engineering",
] as const;

export const OTHER_MAJORS = [
  "Medicine (State Exam)",
  "Lehramt Sport",
  "Brewing (Diplombraumeister)",
  "Technology Management (Honours)",
  "studium MINT",
  "Teaching – Erweiterungsfach",
  "Other",
] as const;

export const MAJORS_BY_LEVEL: Record<DegreeLevel, readonly string[]> = {
  BACHELOR: BACHELOR_MAJORS,
  MASTER: MASTER_MAJORS,
  OTHER: OTHER_MAJORS,
};

export function isKnownMajor(level: DegreeLevel, value: string): boolean {
  return MAJORS_BY_LEVEL[level].includes(value);
}

/**
 * Reasonable upper bound on the "semester in current program" field. The
 * OTHER bucket gets more headroom because state-exam programs (Medicine,
 * Lehramt) run longer than a normal Bachelor.
 */
export const SEMESTER_LIMITS: Record<DegreeLevel, number> = {
  BACHELOR: 12,
  MASTER: 8,
  OTHER: 14,
};

export function semesterOptions(level: DegreeLevel | null | undefined): number[] {
  const max = level ? SEMESTER_LIMITS[level] : 14;
  return Array.from({ length: max }, (_, index) => index + 1);
}

/** Absolute max across all levels — used for validation on the API. */
export const MAX_SEMESTER = Math.max(...Object.values(SEMESTER_LIMITS));
