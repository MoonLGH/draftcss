import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePage = "https://mlbbhub.com/id/draft-simulator";
const dryRun = process.argv.includes("--dry-run");
const concurrency = 8;

async function getHeroAssets() {
  const response = await fetch(sourcePage, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; CSSDraftLabAssetSync/1.0)" },
  });
  if (!response.ok) throw new Error(`Could not fetch reference page (${response.status})`);
  const html = await response.text();
  const firstHero = html.indexOf("\\\"draftData\\\":{\\\"heroes\\\":[");
  if (firstHero < 0) throw new Error("Could not find the hero data in the reference page");

  const starts = [...html.slice(firstHero).matchAll(/\\\"id\\\":(\d+),\\\"slug\\\":\\\"([^\"]+)\\\",\\\"name\\\":\\\"([^\"]+)\\\",\\\"role\\\":/g)];
  if (starts.length < 100) throw new Error(`Unexpected hero record count: ${starts.length}`);

  return starts.map((match, index) => {
    const nextIndex = starts[index + 1]?.index;
    const record = html.slice(firstHero + match.index, nextIndex === undefined ? html.length : firstHero + nextIndex);
    const rolesRaw = record.match(/\\\"role\\\":\[([^\]]*)\]/)?.[1] || "";
    const roles = [...rolesRaw.matchAll(/\\\"([^\"]+)\\\"/g)].map((role) => role[1]);
    const portrait = record.match(/\\\"portrait\\\":\\\"([^\"]+)\\\"/)?.[1];
    const splash = record.match(/\\\"splashArt\\\":\\\"([^\"]+)\\\"/)?.[1] || null;
    if (!portrait) throw new Error(`No portrait URL found for ${match[3]}`);
    return { id: Number(match[1]), slug: match[2], name: match[3], roles, portraitSource: portrait, splashSource: splash };
  });
}

function imageExtension(url) {
  const extension = path.extname(new URL(url).pathname).toLowerCase();
  return extension === ".png" || extension === ".webp" ? extension : ".jpg";
}

async function downloadOne(source, destination) {
  try {
    if ((await stat(destination)).size > 0) return { skipped: true, bytes: 0 };
  } catch {}
  const response = await fetch(source, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; CSSDraftLabAssetSync/1.0)" },
  });
  if (!response.ok) throw new Error(`Image request failed (${response.status}): ${source}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (!data.length) throw new Error(`Empty image response: ${source}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, data);
  return { skipped: false, bytes: data.length };
}

const sourceHeroes = await getHeroAssets();
const rosterPath = path.join(projectRoot, "shared", "heroes.json");
const roster = JSON.parse(await readFile(rosterPath, "utf8"));
const sourceByName = new Map(sourceHeroes.map((hero) => [hero.name.toLowerCase(), hero]));
const rosterNames = new Set(roster.map((hero) => hero.name.toLowerCase()));
const missingInSource = roster.filter((hero) => !sourceByName.has(hero.name.toLowerCase())).map((hero) => hero.name);
if (missingInSource.length) throw new Error(`No matching source hero records: ${missingInSource.join(", ")}`);

const imageJobs = [];
const assetRecords = sourceHeroes.map((hero) => {
  const portraitFile = `${hero.slug}${imageExtension(hero.portraitSource)}`;
  const portrait = `/assets/mlbb/portraits/${portraitFile}`;
  imageJobs.push({ source: hero.portraitSource, destination: path.join(projectRoot, "public", portrait.slice(1).replaceAll("/", path.sep)), kind: "portrait", hero: hero.name });
  let splashArt = null;
  if (hero.splashSource) {
    const splashFile = `${hero.slug}${imageExtension(hero.splashSource)}`;
    splashArt = `/assets/mlbb/splashes/${splashFile}`;
    imageJobs.push({ source: hero.splashSource, destination: path.join(projectRoot, "public", splashArt.slice(1).replaceAll("/", path.sep)), kind: "splash", hero: hero.name });
  }
  return {
    id: hero.id,
    slug: hero.slug,
    name: hero.name,
    roles: hero.roles,
    portrait,
    portraitSource: hero.portraitSource,
    splashArt,
    splashSource: hero.splashSource,
  };
});

if (dryRun) {
  console.log(JSON.stringify({ page: sourcePage, sourceHeroes: sourceHeroes.length, rosterHeroes: roster.length, imageFiles: imageJobs.length, portraits: sourceHeroes.length, splashes: sourceHeroes.filter((hero) => hero.splashSource).length, missingInRoster: sourceHeroes.filter((hero) => !rosterNames.has(hero.name.toLowerCase())).map((hero) => hero.name), sample: assetRecords.slice(0, 3) }, null, 2));
  process.exit(0);
}

let nextJob = 0;
let finished = 0;
let downloaded = 0;
let totalBytes = 0;
const worker = async () => {
  while (nextJob < imageJobs.length) {
    const job = imageJobs[nextJob++];
    const result = await downloadOne(job.source, job.destination);
    if (!result.skipped) {
      downloaded++;
      totalBytes += result.bytes;
    }
    finished++;
    if (finished % 20 === 0 || finished === imageJobs.length) console.log(`Fetched ${finished}/${imageJobs.length} image files`);
  }
};
await Promise.all(Array.from({ length: concurrency }, worker));

const updatedRoster = roster.map((hero) => {
  const source = sourceByName.get(hero.name.toLowerCase());
  const asset = assetRecords.find((record) => record.name.toLowerCase() === hero.name.toLowerCase());
  return { ...hero, slug: source.slug, portrait: asset.portrait, splashArt: asset.splashArt };
});
await writeFile(rosterPath, `${JSON.stringify(updatedRoster, null, 2)}\n`, "utf8");

const publicRoot = path.join(projectRoot, "public", "assets", "mlbb");
await mkdir(publicRoot, { recursive: true });
await writeFile(path.join(publicRoot, "manifest.json"), `${JSON.stringify({ sourcePage, retrievedAt: new Date().toISOString(), heroCount: sourceHeroes.length, imageCount: imageJobs.length, heroes: assetRecords }, null, 2)}\n`, "utf8");
await writeFile(path.join(publicRoot, "ATTRIBUTION.md"), `# Asset sources\n\nHero portraits and splash art were downloaded from the image URLs embedded in [MLBBHub's draft simulator](${sourcePage}).\n\nThe game artwork is owned by its respective rights holders. This local bundle is included for the CSS ILKOM UNNES event draft simulator. The source URL for every image is recorded in manifest.json.\n`);
console.log(`Saved ${sourceHeroes.length} hero portraits and ${sourceHeroes.filter((hero) => hero.splashSource).length} splash arts (${downloaded} new files, ${(totalBytes / 1024 / 1024).toFixed(1)} MiB downloaded).`);
