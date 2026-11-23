#!/usr/bin/env node
// Checks catalog.json and the packs it lists, the same way Ambient Desk checks them before installing.
// Lives in tools/ of the AmbientDesk-scenes repo (store/ in the app's repo); paths below are from that root.
//
//   node tools/validate.mjs           check everything; exit code 1 on any error
//   node tools/validate.mjs --write   also fill in each pack's sha256 and size from its file, and turn relative
//                                     paths (packs/<id>/scene.svg) into the published URLs under BASE_URL
//   node tools/validate.mjs --local   write catalog.local.json, the same catalogue with relative paths, to try
//                                     the packs in the app from a local server before they are published
//
// No dependencies: plain Node 18 or later. Keep the limits here in step with SceneStore.cs in the Windows app.

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const STORE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CATALOG = join(STORE, 'catalog.json')
const WRITE = process.argv.includes('--write')
const LOCAL = process.argv.includes('--local')

/** Where this repo's files are published; every pack's file and preview URL starts with it. */
export const BASE_URL = 'https://raw.githubusercontent.com/mo3athothman/AmbientDesk-scenes/main/'

const MB = 1024 * 1024
/** Largest file per scene type, in bytes. */
export const MAX_BYTES = { svg: 5 * MB, html: 5 * MB, image: 20 * MB, video: 100 * MB }
const MAX_PREVIEW = 1 * MB
const MAX_CATALOG = 1 * MB
const MAX_PACKS = 500
const EXTENSIONS = {
  svg: ['.svg'],
  image: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'],
  video: ['.mp4', '.webm'],
  html: ['.html'],
}
const PREVIEW_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.webp']
const LICENCES = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'MIT', 'Apache-2.0']
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const errors = []
const warnings = []
const fail = (where, message) => errors.push(`${where}: ${message}`)
const warn = (where, message) => warnings.push(`${where}: ${message}`)

/** Problems with an SVG's text that would let it run code or reach the network. Mirrors CustomScenes.CheckSvg. */
export function svgProblems(text) {
  const problems = []
  const head = text.replace(/^﻿/, '').trimStart()
  if (!/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) problems.push('does not start with <svg>')
  if (/<script[\s>/]/i.test(text)) problems.push('contains <script>')
  if (/\son[a-z]+\s*=/i.test(text)) problems.push('has an on…= event handler attribute')
  if (/javascript:/i.test(text)) problems.push('contains a javascript: URL')
  if (/<(foreignObject|iframe|embed|object)[\s>/]/i.test(text)) problems.push('contains <foreignObject>, <iframe>, <embed> or <object>')
  if (/(href\s*=\s*["']\s*(https?:)?\/\/)|url\(\s*["']?\s*(https?:)?\/\//i.test(text)) problems.push('loads something from the web (packs must be self-contained)')
  if (/@import/i.test(text)) problems.push('uses CSS @import')
  return problems
}

/** Whether a file's first bytes look like its type. */
function looksLike(type, ext, bytes) {
  const ascii = (start, end) => bytes.subarray(start, end).toString('latin1')
  switch (type) {
    case 'svg': return true // checked as text by svgProblems
    case 'html': return /<(!doctype html|html|head|body|canvas|svg|div|script)/i.test(bytes.subarray(0, 2048).toString('utf8'))
    case 'image':
      if (ext === '.png') return bytes[0] === 0x89 && ascii(1, 4) === 'PNG'
      if (ext === '.jpg' || ext === '.jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8
      if (ext === '.gif') return ascii(0, 4) === 'GIF8'
      if (ext === '.webp') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
      if (ext === '.avif') return ascii(4, 8) === 'ftyp'
      return false
    case 'video':
      if (ext === '.mp4') return ascii(4, 8) === 'ftyp'
      if (ext === '.webm') return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
      return false
  }
  return false
}

/**
 * A catalogue URL → its file inside packs/<id>/, or undefined (with an error) when it points anywhere else.
 * URLs must be BASE_URL + packs/<id>/…; a relative packs/<id>/… path is accepted with --write, which rewrites it.
 */
function packFile(where, pack, field) {
  const { id } = pack
  const value = pack[field]
  if (typeof value !== 'string' || !value) { fail(where, `${field} is missing`); return undefined }
  let path = value
  if (value.startsWith(BASE_URL)) path = value.slice(BASE_URL.length)
  else if (/^[a-z]+:/i.test(value) || value.startsWith('/') || value.includes('\\')) {
    fail(where, `${field} must start with ${BASE_URL}packs/${id}/`)
    return undefined
  } else if (!WRITE) {
    fail(where, `${field} must be the published URL ${BASE_URL}${value} (run with --write to rewrite it)`)
  }
  const normal = posix.normalize(path)
  if (!normal.startsWith(`packs/${id}/`) || normal.includes('..')) { fail(where, `${field} must be inside packs/${id}/`); return undefined }
  const full = join(STORE, ...normal.split('/'))
  if (!existsSync(full) || !statSync(full).isFile()) { fail(where, `${field} ${path} does not exist`); return undefined }
  if (WRITE) pack[field] = BASE_URL + normal
  return full
}

function checkPack(pack, index, seen) {
  const where = `packs[${index}]${pack && typeof pack.id === 'string' ? ` (${pack.id})` : ''}`
  if (!pack || typeof pack !== 'object') { fail(where, 'is not an object'); return }
  const { id, title, author, licence, description, type, tags } = pack

  if (typeof id !== 'string' || !ID.test(id) || id.length > 48) fail(where, 'id must be lowercase-kebab-case, 48 characters at most')
  else if (seen.has(id)) fail(where, `id ${id} is used twice`)
  else seen.add(id)
  if (typeof title !== 'string' || !title.trim() || title.length > 60) fail(where, 'title must be 1–60 characters')
  if (typeof author !== 'string' || !author.trim() || author.length > 60) fail(where, 'author must be 1–60 characters')
  if (!LICENCES.includes(licence)) fail(where, `licence must be one of ${LICENCES.join(', ')}`)
  if (description !== undefined && (typeof description !== 'string' || description.length > 200)) fail(where, 'description must be 200 characters at most')
  if (!Array.isArray(tags) || tags.length > 8 || !tags.every((t) => typeof t === 'string' && TAG.test(t) && t.length <= 24)) {
    fail(where, 'tags must be a list of up to 8 lowercase-kebab-case words')
  }
  if (!(type in MAX_BYTES)) { fail(where, `type must be one of ${Object.keys(MAX_BYTES).join(', ')}`); return }
  if (typeof id !== 'string' || !ID.test(id)) return

  const file = packFile(where, pack, 'file')
  if (file) {
    const ext = extname(file).toLowerCase()
    const bytes = readFileSync(file)
    if (!EXTENSIONS[type].includes(ext)) fail(where, `a ${type} pack's file must end in ${EXTENSIONS[type].join(' or ')}`)
    if (bytes.length > MAX_BYTES[type]) fail(where, `file is ${(bytes.length / MB).toFixed(1)} MB; ${type} packs may be ${MAX_BYTES[type] / MB} MB at most`)
    if (type === 'svg') for (const p of svgProblems(bytes.toString('utf8'))) fail(where, `file ${p}`)
    else if (!looksLike(type, ext, bytes)) fail(where, `file does not look like a ${ext} file`)
    if (type === 'html' && /(src|href)\s*=\s*["']\s*(https?:)?\/\//i.test(bytes.toString('utf8'))) warn(where, 'the page loads something from the web; packs should be self-contained')

    const sha256 = createHash('sha256').update(bytes).digest('hex')
    if (WRITE) { pack.sha256 = sha256; pack.size = bytes.length }
    else {
      if (pack.sha256 !== sha256) fail(where, `sha256 is ${pack.sha256 ?? 'missing'} but the file hashes to ${sha256} (run with --write)`)
      if (pack.size !== bytes.length) fail(where, `size is ${pack.size ?? 'missing'} but the file is ${bytes.length} bytes (run with --write)`)
    }
  }

  const preview = packFile(where, pack, 'preview')
  if (preview) {
    const ext = extname(preview).toLowerCase()
    const bytes = readFileSync(preview)
    if (!PREVIEW_EXTENSIONS.includes(ext)) fail(where, `preview must be ${PREVIEW_EXTENSIONS.join(', ')}`)
    if (bytes.length > MAX_PREVIEW) fail(where, `preview is larger than ${MAX_PREVIEW / MB} MB`)
    if (ext === '.svg') for (const p of svgProblems(bytes.toString('utf8'))) fail(where, `preview ${p}`)
    else if (!looksLike('image', ext, bytes)) fail(where, `preview does not look like a ${ext} file`)
  }
}

function main() {
  if (!existsSync(CATALOG)) { console.error('catalog.json is missing'); process.exit(1) }
  const raw = readFileSync(CATALOG)
  if (raw.length > MAX_CATALOG) fail('catalog.json', `is larger than ${MAX_CATALOG / MB} MB`)
  let catalog
  try { catalog = JSON.parse(raw.toString('utf8')) } catch (e) { console.error(`catalog.json is not valid JSON: ${e.message}`); process.exit(1) }

  if (catalog.format !== 1) fail('catalog.json', 'format must be 1')
  if (typeof catalog.name !== 'string' || !catalog.name) fail('catalog.json', 'name is missing')
  if (!Array.isArray(catalog.packs)) fail('catalog.json', 'packs must be a list')
  else {
    if (catalog.packs.length > MAX_PACKS) fail('catalog.json', `lists more than ${MAX_PACKS} packs`)
    const seen = new Set()
    catalog.packs.forEach((pack, i) => checkPack(pack, i, seen))

    // Folders under packs/ that the catalogue doesn't list are probably a forgotten entry.
    const packsDir = join(STORE, 'packs')
    if (existsSync(packsDir)) {
      for (const name of readdirSync(packsDir)) {
        if (!seen.has(name)) warn(`packs/${name}`, 'is not listed in catalog.json')
      }
    }
  }

  if (WRITE && errors.length === 0) {
    catalog.updated = new Date().toISOString().slice(0, 10)
    writeFileSync(CATALOG, JSON.stringify(catalog, null, 2) + '\n')
    console.log('Wrote sha256, size and URLs for every pack to catalog.json.')
  }
  if (LOCAL && errors.length === 0) {
    const local = { ...catalog, packs: catalog.packs.map((p) => ({ ...p, file: p.file.replace(BASE_URL, ''), preview: p.preview.replace(BASE_URL, '') })) }
    writeFileSync(join(STORE, 'catalog.local.json'), JSON.stringify(local, null, 2) + '\n')
    console.log('Wrote catalog.local.json: serve this folder (python -m http.server 8765) and set the app to')
    console.log('http://localhost:8765/catalog.local.json in Settings → Scene store.')
  }

  for (const w of warnings) console.warn(`warning  ${w}`)
  for (const e of errors) console.error(`error    ${e}`)
  const count = Array.isArray(catalog.packs) ? catalog.packs.length : 0
  if (errors.length) {
    console.error(`\n${errors.length} problem${errors.length === 1 ? '' : 's'} in ${relative(process.cwd(), CATALOG) || CATALOG}.`)
    process.exit(1)
  }
  console.log(`OK: ${count} pack${count === 1 ? '' : 's'}${warnings.length ? `, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : ''}.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
