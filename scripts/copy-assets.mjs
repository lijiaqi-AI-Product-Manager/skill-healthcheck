// Copies non-TypeScript assets (the bundled lexicon) next to the compiled output.
import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(join(root, 'dist'), { recursive: true })
cpSync(join(root, 'src', 'lexicon.json'), join(root, 'dist', 'lexicon.json'))
