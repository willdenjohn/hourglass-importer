'use strict';

const fs = require('fs');
const { normalize } = require('./text');

const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'del', 'la', 'las', 'los', 'y']);

function fullName(publisher) {
  return [publisher.firstname, publisher.middlename, publisher.lastname].filter(Boolean).join(' ');
}

function words(name) {
  return normalize(name).split(/[^a-z]+/).filter(word => word.length > 1 && !STOPWORDS.has(word));
}

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = a[i - 1] === b[j - 1] ? previous : 1 + Math.min(previous, row[j], row[j - 1]);
      previous = current;
    }
  }
  return row[b.length];
}

function similar(a, b) {
  const shorter = Math.min(a.length, b.length);
  return a === b || (shorter >= 4 && levenshtein(a, b) <= (shorter >= 7 ? 2 : 1));
}

function score(formName, publisher) {
  const fromForm = words(formName);
  const fromRegistry = words(fullName(publisher));
  if (!fromForm.length || !fromRegistry.length) return 0;
  const common = fromForm.filter(word => fromRegistry.some(other => similar(word, other))).length;
  const firstMatches = similar(fromForm[0], fromRegistry[0]);
  const identical = fromForm.filter(word => fromRegistry.includes(word)).length;
  const coverage = common / Math.min(fromForm.length, fromRegistry.length) + identical * 0.01;
  return firstMatches ? coverage : coverage * 0.4;
}

function loadAliases(file) {
  if (!fs.existsSync(file)) return new Map();
  const content = JSON.parse(fs.readFileSync(file, 'utf8'));
  return new Map(Object.entries(content).map(([name, id]) => [normalize(name), Number(id)]));
}

function createMatcher(publishers, aliases) {
  const byId = new Map(publishers.map(publisher => [publisher.id, publisher]));

  return function match(formName) {
    const aliasId = aliases.get(normalize(formName));
    if (aliasId && byId.has(aliasId)) return { publisher: byId.get(aliasId), confidence: 'alias' };

    const exact = publishers.filter(publisher => normalize(fullName(publisher)) === normalize(formName));
    const exactWithGroup = exact.filter(publisher => publisher.group_id);
    if (exact.length === 1) return { publisher: exact[0], confidence: 'exact' };
    if (exactWithGroup.length === 1) return { publisher: exactWithGroup[0], confidence: 'exact' };

    const ranking = publishers
      .map(publisher => ({ publisher, score: score(formName, publisher) }))
      .sort((a, b) => b.score - a.score);
    const [best, second] = ranking;
    if (!best || best.score < 0.5) return { publisher: null, confidence: 'none' };
    const tie = Boolean(second && second.score === best.score);
    return { publisher: best.publisher, confidence: best.score >= 0.99 && !tie ? 'high' : 'low', tie };
  };
}

module.exports = { createMatcher, loadAliases, fullName };
