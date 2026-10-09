import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const repoRoot = process.cwd();
const aiMaterialRoot = resolve(repoRoot, 'ai-material');
const sessionsDir = resolve(aiMaterialRoot, 'sessions');
const configPath = resolve(aiMaterialRoot, '.ai-config.json');
const templatePath = resolve(aiMaterialRoot, 'templates/session.md');

const args = process.argv.slice(2);
const aiName = (args[0] || '').toLowerCase().trim();
const topicArgs = args.slice(1);
const topicParts = topicArgs.map((s) => s.toLowerCase());

if (!aiName) {
  console.error('Usage: node scripts/ai-session.mjs <ai-name> [topic...]');
  console.error('Example: node scripts/ai-session.mjs claude login-flow-fix');
  process.exit(1);
}

const now = new Date();
const dateStr = now.toISOString().slice(0, 10);
const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');

const slugParts = topicParts.length > 0 ? topicParts : ['session'];
const slug = slugParts
  .map((s) => s.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''))
  .join('-') || 'session';

const fileName = `${dateStr}-${timeStr}-${aiName}-${slug}.md`;
const sessionPath = resolve(sessionsDir, fileName);
const sessionRelPath = relative(aiMaterialRoot, sessionPath);

mkdirSync(sessionsDir, { recursive: true });

const template = readFileSync(templatePath, 'utf8');
const filled = template
  .replace(/SESSION_TITLE/g, slug.replace(/-+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
  .replace(/YYYY-MM-DD/g, dateStr)
  .replace(/UNKNOWN/g, 'UNKNOWN')
  .replace(/AI_NAME/g, aiName.toUpperCase())
  .replace(/SESSION_SUMMARY/g, 'Update after session.');

writeFileSync(sessionPath, filled, 'utf8');

const tagsBase = 'session';
const tags = topicParts.length > 0 ? [tagsBase, ...topicParts].join(', ') : tagsBase;

console.log(`Created session: ${sessionRelPath}`);
console.log(`AI name: ${aiName}`);
console.log(`Tags: ${tags}`);
console.log(`Topic: ${topicParts.join(' ')}`);

try {
  const raw = readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw);
  const commands = config && typeof config === 'object' && config.commands ? config.commands : null;
  const command = commands && typeof commands === 'object' && commands[aiName] ? commands[aiName] : '';

  if (command && command.trim()) {
    console.log(`Spawning command: ${command}`);
    const env = Object.assign({}, process.env, {
      AI_SESSION_FILE: sessionPath,
    });
    try {
      const { execFileSync } = await import('node:child_process');
      execFileSync(command, [], { env, stdio: 'inherit', encoding: 'utf8' });
    } catch (error) {
      console.error('Spawned command exited with non-zero status.');
    }
    console.log('');
    console.log('Reminder: update the session file above.');
    console.log('Then run: node scripts/ai-index.mjs');
  } else {
    console.log('');
    console.log('No command configured for this AI name in ai-material/.ai-config.json.');
    console.log('Fill the session file manually, then run: node scripts/ai-index.mjs');
  }
} catch (error) {
  console.log('');
  console.log('Could not read ai-material/.ai-config.json. Fill the session file manually.');
  console.log('Then run: node scripts/ai-index.mjs');
}
