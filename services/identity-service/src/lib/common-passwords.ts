// A compact deny-list of the most common / breached passwords. This is a
// dependency-free, offline "breach screen": it won't catch everything a full
// HaveIBeenPwned range query would, but it cheaply blocks the credentials that
// dominate credential-stuffing lists. Entries are compared case-insensitively
// (see isCommonPassword). Keep lowercase.
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "passw0rd", "p@ssw0rd", "p@ssword",
  "123456", "1234567", "12345678", "123456789", "1234567890", "12345",
  "qwerty", "qwerty123", "qwertyuiop", "qwerty12345", "1q2w3e4r", "1q2w3e4r5t",
  "abc123", "abcd1234", "a1b2c3d4", "123abc", "letmein", "welcome", "welcome1",
  "welcome123", "admin", "admin123", "administrator", "root", "toor",
  "iloveyou", "sunshine", "princess", "football", "baseball", "dragon",
  "monkey", "master", "shadow", "superman", "batman", "trustno1", "whatever",
  "starwars", "michael", "jordan", "hunter2", "computer", "internet",
  "samsung", "google", "facebook", "changeme", "changeme123", "secret",
  "secret123", "login", "test", "test123", "testing", "guest", "default",
  "pass", "pass123", "passpass", "temp", "temp123", "temporary", "asdf",
  "asdfgh", "asdfghjkl", "zxcvbn", "zxcvbnm", "qazwsx", "qazwsxedc",
  "11111111", "00000000", "0000000000", "88888888", "aaaaaaaa", "11223344",
  "1122334455", "123123", "123123123", "112233", "121212", "654321",
  "666666", "696969", "111111", "000000", "222222", "777777", "999999",
  "monkey123", "dragon123", "master123", "ninja", "access", "access123",
  "flower", "hello", "hello123", "freedom", "love", "lovely", "money",
  "mustang", "harley", "ranger", "buster", "soccer", "hockey", "killer",
  "george", "michelle", "jessica", "charlie", "andrew", "matthew", "daniel",
  "thomas", "robert", "jennifer", "joshua", "amanda", "summer", "winter",
  "spring", "autumn", "august", "purple", "orange", "yellow", "silver",
  "cricket", "chelsea", "arsenal", "liverpool", "srilanka", "colombo",
  "lanka123", "ceylon", "baaslk", "servicehub",
]);

// True when the password (case-insensitively) is a well-known / breached one.
export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}
