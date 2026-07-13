// Denylist data for the shared content filter (#375). This file is DATA, not
// logic — tune moderation by editing the arrays; the matcher lives in
// moderation.ts. Canonical — identical in review-, provider- and job-service
// (same convention as lib/logging.ts).
//
// LATIN_TERMS: English profanity/abuse plus romanized Sinhala ("Singlish")
// equivalents. Matched case-insensitively on word boundaries, so ordinary
// words that merely contain a term ("class", "assess") never trip the filter.
// Sinhala is agglutinative even when romanized, so common inflections are
// listed explicitly rather than stemmed.
export const LATIN_TERMS: readonly string[] = [
  // English
  "fuck",
  "fucker",
  "fucking",
  "motherfucker",
  "shit",
  "bullshit",
  "bitch",
  "bitches",
  "asshole",
  "arsehole",
  "cunt",
  "dickhead",
  "prick",
  "wanker",
  "whore",
  "slut",
  "bastard",
  "faggot",
  "nigger",
  "nigga",
  "cocksucker",
  "son of a bitch",
  // Romanized Sinhala
  "hutta",
  "huttha",
  "huththa",
  "hutti",
  "huththi",
  "pakaya",
  "pakayo",
  "ponnaya",
  "ponnayo",
  "wesi",
  "vesi",
  "wesige",
  "vesige",
  "balli",
  "ballige",
  "kariya",
  "kariyek",
  "kariyo",
  "hukanawa",
  "hukanna",
  "hukapan",
  "hukala",
];

// Sinhala-script terms, matched as SUBSTRINGS — suffixes attach directly to
// the stem in Sinhala, so boundary matching would miss inflected forms. Keep
// every entry long enough not to occur inside ordinary vocabulary.
export const SINHALA_TERMS: readonly string[] = [
  "හුත්ත",
  "හුත්ති",
  "පකයා",
  "පකය",
  "පොන්නයා",
  "පොන්නය",
  "වේසි",
  "බැල්ලි",
  "කැරියා",
  "කැරි",
  "හුකන",
  "හුකප",
  "හුකල",
];
