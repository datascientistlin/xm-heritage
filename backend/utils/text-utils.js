// text-utils.js
// Shared text processing utilities for the Dawanji project

/**
 * Calculates the similarity between two strings using Levenshtein distance
 * @param {string} str1 - First string to compare
 * @param {string} str2 - Second string to compare
 * @returns {number} - Similarity ratio between 0 and 1
 */
export function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;

  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = computeLevenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Computes the Levenshtein distance between two strings
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @returns {number} - The edit distance
 */
export function computeLevenshteinDistance(s1, s2) {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();

  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) {
      costs[s2.length] = lastValue;
    }
  }
  return costs[s2.length];
}

/**
 * Finds the longest common prefix between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {string} - The longest common prefix
 */
export function findLongestCommonPrefix(str1, str2) {
  let i = 0;
  while (i < str1.length && i < str2.length && str1.charAt(i) === str2.charAt(i)) {
    i++;
  }
  return str1.substring(0, i);
}

/**
 * Cleans text by removing punctuation for comparison purposes
 * @param {string} text - Input text
 * @returns {string} - Text with punctuation removed
 */
export function cleanTextForComparison(text) {
  if (!text) return '';
  return text.replace(/[^\w\s]/gi, '');
}