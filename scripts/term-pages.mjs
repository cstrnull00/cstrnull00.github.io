// 카테고리·태그·개발사·유통사 페이지에 영어 주소를 붙인다.
//
// 실행:  node scripts/term-pages.mjs
//
// Hugo 는 용어 페이지 주소를 글에 적힌 이름에서 만든다. 이름이 한국어라
// /categories/게임-리뷰/ 같은 주소가 되고, 복사하면 %EA%B2%8C... 로 길게 늘어졌다.
// 글의 프론트매터는 그대로 두고(화면에 보이는 이름도 그대로), 각 용어의 페이지
// content/<분류>/<Hugo 가 만든 이름>/_index.md 에 url 을 적어 주소만 영어로 바꾼다.
// 옛 한국어 주소는 aliases 로 새 주소로 넘어가게 한다.
//
// 영어 주소를 정하는 규칙:
//   개발사·유통사  괄호 안의 영어 이름. "CD 프로젝트 레드(CD PROJEKT RED)" → cd-projekt-red
//   카테고리·태그  아래 SLUGS 표. 새 한국어 카테고리나 태그를 쓰면 여기에 한 줄 더한다.
//   이름이 원래 영어면(RPG 등) 주소에 한국어가 없으므로 페이지를 만들지 않는다.
//
// 이미 있는 _index.md 는 건드리지 않는다. 게시된 글(draft 가 아닌 글)의 용어만 본다.
// 새 리뷰를 발행한 뒤 한 번 돌리면 새 개발사·유통사 페이지가 생긴다.

import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
const TAXONOMIES = ['categories', 'tags', 'developers', 'publishers'];

const SLUGS = {
  categories: {
    '게임 리뷰': 'review',
    '탐구와 분석': 'analysis',
  },
  tags: {
    '서사': 'narrative',
    '선택': 'choice',
    '시뮬레이션': 'simulation',
    '오픈월드': 'open-world',
  },
};

// 용어 페이지 폴더 이름. Hugo 가 용어와 페이지를 짝짓는 열쇠라 정확히 같아야 한다.
// 실측: 소문자, 공백 → -, 괄호와 마침표는 남는다. "CD 프로젝트 레드(CD PROJEKT RED)" →
// cd-프로젝트-레드(cd-projekt-red). 괄호를 빼면 짝이 안 맞아 빈 페이지가 따로 생긴다.
function termFolder(term) {
  return term.toLowerCase().replace(/\s+/g, '-');
}

// Hugo 가 실제로 만들던 옛 주소. 폴더 이름에서 괄호만 빠진다 (/developers/cd-프로젝트-레드cd-projekt-red/).
function oldUrlPath(folder) {
  return folder.replace(/[()]/g, '');
}

function asciiSlug(s) {
  return s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function englishSlug(taxonomy, term) {
  const mapped = SLUGS[taxonomy]?.[term];
  if (mapped) return mapped;
  const paren = term.match(/\(([^)]*[A-Za-z][^)]*)\)\s*$/);
  if (paren) return asciiSlug(paren[1]);
  return null;
}

// 프론트매터에서 이 블로그가 쓰는 두 가지 목록 형식만 읽는다.
//   key: [a, b]      key:\n  - a\n  - b
function readFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const lines = m[1].split(/\r?\n/);
  const fm = {};
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, rest] = kv;
    const unquote = (s) => s.trim().replace(/\s+#.*$/, '').replace(/^['"]|['"]$/g, '');
    if (rest.startsWith('[')) {
      fm[key] = rest.replace(/^\[|\]\s*(#.*)?$/g, '').split(',').map(unquote).filter(Boolean);
    } else if (rest === '' || rest.startsWith('#')) {
      const items = [];
      while (i + 1 < lines.length && /^\s+-\s/.test(lines[i + 1])) items.push(unquote(lines[++i].replace(/^\s+-\s/, '')));
      fm[key] = items;
    } else {
      fm[key] = unquote(rest);
    }
  }
  return fm;
}

function* markdownFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* markdownFiles(p);
    else if (name.endsWith('.md')) yield p;
  }
}

const terms = Object.fromEntries(TAXONOMIES.map((t) => [t, new Set()]));
for (const file of markdownFiles(CONTENT)) {
  const fm = readFrontMatter(readFileSync(file, 'utf8'));
  if (!fm || fm.draft === 'true') continue;
  for (const t of TAXONOMIES) for (const v of fm[t] || []) terms[t].add(v);
}

let created = 0;
const missing = [];
for (const taxonomy of TAXONOMIES) {
  for (const term of [...terms[taxonomy]].sort()) {
    const folder = termFolder(term);
    const path = oldUrlPath(folder);
    if (/^[\x00-\x7f]*$/.test(path)) continue; // 주소가 이미 영어
    const slug = englishSlug(taxonomy, term);
    if (!slug) { missing.push(`${taxonomy}: ${term}`); continue; }
    const file = join(CONTENT, taxonomy, folder, '_index.md');
    if (existsSync(file)) continue;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, [
      '---',
      `title: '${term.replace(/'/g, "''")}'`,
      `url: /${taxonomy}/${slug}/`,
      '# 옛 한국어 주소에서 넘어오는 링크용 (scripts/term-pages.mjs)',
      'aliases:',
      `  - /${taxonomy}/${path}/`,
      '---',
      '',
    ].join('\n'));
    console.log(`[term-pages] ${taxonomy}/${path} → /${taxonomy}/${slug}/`);
    created++;
  }
}

console.log(`[term-pages] 새로 만든 페이지 ${created}개`);
if (missing.length) {
  console.error('[term-pages] 영어 주소를 정하지 못한 용어 (SLUGS 표에 추가하세요):\n  ' + missing.join('\n  '));
  process.exitCode = 1;
}
