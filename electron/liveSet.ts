import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * A Live Set beside the stems, so the export opens in Ableton as a song
 * rather than a folder to drag in by hand.
 *
 * A `.als` is gzipped XML, and Live is strict about the shape of it — every
 * track carries a few hundred lines of mixer and device defaults, and the ids
 * inside them must be unique across the set. So the set is never written from
 * nothing: it is made from **the Live installed on this machine** — its own
 * `DefaultLiveSet.als`, the empty set Live opens on — which is a schema that
 * Live wrote and will read, and is not ours to ship. Its first audio track is
 * the prototype; its MIDI and audio tracks are dropped, and the prototype is
 * copied once per stem with its ids renumbered from the set's `NextPointeeId`.
 * The returns and the main track are left as Live made them. No Live, no set:
 * the stems are the export, and the set is a convenience on top of them.
 *
 * Each stem's clips go in the arrangement at the bar they were laid from, so
 * every track starts at 1.1.1 and the sections butt together. The files are
 * already straight, so each clip is warped by two markers, its first sample and
 * its last, at the tempo it was laid at: at the set's tempo it plays as written,
 * and moved off it Live stretches it like any warped loop. The tempo is set,
 * and where sections were laid at their own tempos the tempo track steps at each.
 *
 * **The same clips are in the Session too**, one scene per section: scene one
 * launches the intro on every stem, scene two the next section, and each scene
 * is named for its section. Where sections were laid at their own tempos each
 * scene carries its tempo, so launching it sets the set's. The set grows as
 * many scenes as there are sections; Live's default has eight.
 *
 * **The export folder is a Live Project**, which is a folder with an
 * `Ableton Project Info` folder in it — `markProject`. The samples are already
 * inside it, so they are referred to as the project's (`RelativePathType` 3):
 * Live keeps them where they are rather than copying them into the User
 * Library when the set is saved, and the folder moves anywhere as one.
 */

/** One file on a track: where it sits in the arrangement, in beats, the scene it launches from, and what it was laid at. */
export interface LiveClip {
  file: string;
  name: string;
  /** Beats from 1.1.1. */
  at: number;
  /** The Session scene, from zero: its section's place in the song. */
  scene: number;
  bpm: number;
  frames: number;
  rate: number;
}

export interface LiveTrack {
  name: string;
  /** Live's clip and track colour, an index into its palette. */
  color: number;
  clips: LiveClip[];
}

/** Where the tempo changes, in beats from 1.1.1; the first is the set's tempo. */
export interface TempoStep {
  at: number;
  bpm: number;
}

/** Newest first, so a machine with Live 11 and 12 writes for 12. */
const LIVES = ['/Applications', path.join(process.env.HOME ?? '', 'Applications')];

/** The empty set of the newest Live on this machine, decompressed, or null where there is none. */
export function liveTemplate(): string | null {
  for (const folder of LIVES) {
    let apps: string[];
    try {
      apps = fs.readdirSync(folder).filter((name) => /^Ableton Live \d+.*\.app$/.test(name));
    } catch {
      continue;
    }
    apps.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const app of apps) {
      const file = path.join(folder, app, 'Contents/App-Resources/Builtin/Templates/DefaultLiveSet.als');
      if (fs.existsSync(file)) return zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
    }
  }
  return null;
}

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A number the way Live writes one: plain, and no longer than it needs. */
const num = (value: number): string => String(Number(value.toFixed(12)));

/** The top-level tracks in `<Tracks>`, each as its whole element. */
function tracksIn(body: string): { kind: string; xml: string }[] {
  const found: { kind: string; xml: string }[] = [];
  const open = /^\t\t\t<(\w+Track) /gm;
  for (let match = open.exec(body); match; match = open.exec(body)) {
    const close = `\t\t\t</${match[1]}>`;
    const end = body.indexOf(close, match.index);
    if (end < 0) throw new Error(`unclosed ${match[1]} in the Live template`);
    found.push({ kind: match[1], xml: body.slice(match.index, end + close.length) });
    open.lastIndex = end + close.length;
  }
  return found;
}

/**
 * Every `list` in `xml` grown to `count` of its `item`s, each new one a copy of
 * the last with the next id: the scenes, and each track's clip slots, which
 * Live wants one of per scene.
 */
function grown(xml: string, list: string, item: string, count: number): string {
  return xml.replace(new RegExp(`(<${list}>)([\\s\\S]*?)(\\n\\t*</${list}>)`, 'g'), (_match, open: string, body: string, close: string) => {
    const items = [...body.matchAll(new RegExp(`\\n(\\t*)<${item} Id="(\\d+)">[\\s\\S]*?\\n\\1</${item}>`, 'g'))];
    const last = items.at(-1);
    if (!last) return open + body + close;
    const more: string[] = [];
    for (let id = Number(last[2]) + 1; id < count; id++) more.push(last[0].replace(`<${item} Id="${last[2]}">`, `<${item} Id="${id}">`));
    return open + body + more.join('') + close;
  });
}

/** A clip at `at` beats: its place in the arrangement, or zero in a Session slot. */
function clipOf(clip: LiveClip, id: number, color: number, where: string, at = clip.at): string {
  const seconds = clip.frames / clip.rate;
  const beats = (seconds * clip.bpm) / 60;
  const end = num(beats);
  const stat = fs.statSync(clip.file);
  const relative = path.relative(where, clip.file).split(path.sep).join('/');
  const t = '\t'.repeat(9);
  return `
${t}<AudioClip Id="${id}" Time="${num(at)}">
${t}	<LomId Value="0" />
${t}	<LomIdView Value="0" />
${t}	<CurrentStart Value="${num(at)}" />
${t}	<CurrentEnd Value="${num(at + beats)}" />
${t}	<Loop>
${t}		<LoopStart Value="0" />
${t}		<LoopEnd Value="${end}" />
${t}		<StartRelative Value="0" />
${t}		<LoopOn Value="false" />
${t}		<OutMarker Value="${end}" />
${t}		<HiddenLoopStart Value="0" />
${t}		<HiddenLoopEnd Value="${end}" />
${t}	</Loop>
${t}	<Name Value="${escape(clip.name)}" />
${t}	<Annotation Value="" />
${t}	<Color Value="${color}" />
${t}	<LaunchMode Value="0" />
${t}	<LaunchQuantisation Value="0" />
${t}	<TimeSignature>
${t}		<TimeSignatures>
${t}			<RemoteableTimeSignature Id="0">
${t}				<Numerator Value="4" />
${t}				<Denominator Value="4" />
${t}				<Time Value="0" />
${t}			</RemoteableTimeSignature>
${t}		</TimeSignatures>
${t}	</TimeSignature>
${t}	<Envelopes>
${t}		<Envelopes />
${t}	</Envelopes>
${t}	<ScrollerTimePreserver>
${t}		<LeftTime Value="0" />
${t}		<RightTime Value="0" />
${t}	</ScrollerTimePreserver>
${t}	<TimeSelection>
${t}		<AnchorTime Value="0" />
${t}		<OtherTime Value="0" />
${t}	</TimeSelection>
${t}	<Legato Value="false" />
${t}	<Ram Value="false" />
${t}	<GrooveSettings>
${t}		<GrooveId Value="-1" />
${t}	</GrooveSettings>
${t}	<Disabled Value="false" />
${t}	<VelocityAmount Value="0" />
${t}	<FollowAction>
${t}		<FollowTime Value="4" />
${t}		<IsLinked Value="true" />
${t}		<LoopIterations Value="1" />
${t}		<FollowActionA Value="4" />
${t}		<FollowActionB Value="0" />
${t}		<FollowChanceA Value="100" />
${t}		<FollowChanceB Value="0" />
${t}		<JumpIndexA Value="1" />
${t}		<JumpIndexB Value="1" />
${t}		<FollowActionEnabled Value="false" />
${t}	</FollowAction>
${t}	<Grid>
${t}		<FixedNumerator Value="1" />
${t}		<FixedDenominator Value="16" />
${t}		<GridIntervalPixel Value="20" />
${t}		<Ntoles Value="2" />
${t}		<SnapToGrid Value="true" />
${t}		<Fixed Value="false" />
${t}	</Grid>
${t}	<FreezeStart Value="0" />
${t}	<FreezeEnd Value="0" />
${t}	<IsWarped Value="true" />
${t}	<TakeId Value="1" />
${t}	<IsInKey Value="true" />
${t}	<ScaleInformation>
${t}		<Root Value="0" />
${t}		<Name Value="0" />
${t}	</ScaleInformation>
${t}	<AutomationEnvelopesListWrapper LomId="0" />
${t}	<SampleRef>
${t}		<FileRef>
${t}			<RelativePathType Value="3" />
${t}			<RelativePath Value="${escape(relative)}" />
${t}			<Path Value="${escape(clip.file)}" />
${t}			<Type Value="2" />
${t}			<LivePackName Value="" />
${t}			<LivePackId Value="" />
${t}			<OriginalFileSize Value="${stat.size}" />
${t}			<OriginalCrc Value="0" />
${t}			<SourceHint Value="" />
${t}		</FileRef>
${t}		<LastModDate Value="${Math.floor(stat.mtimeMs / 1000)}" />
${t}		<SourceContext />
${t}		<SampleUsageHint Value="0" />
${t}		<DefaultDuration Value="${clip.frames}" />
${t}		<DefaultSampleRate Value="${clip.rate}" />
${t}		<SamplesToAutoWarp Value="0" />
${t}	</SampleRef>
${t}	<Onsets>
${t}		<UserOnsets />
${t}		<HasUserOnsets Value="false" />
${t}	</Onsets>
${t}	<WarpMode Value="4" />
${t}	<GranularityTones Value="30" />
${t}	<GranularityTexture Value="65" />
${t}	<FluctuationTexture Value="25" />
${t}	<TransientResolution Value="6" />
${t}	<TransientLoopMode Value="2" />
${t}	<TransientEnvelope Value="100" />
${t}	<ComplexProFormants Value="100" />
${t}	<ComplexProEnvelope Value="128" />
${t}	<Sync Value="true" />
${t}	<HiQ Value="true" />
${t}	<Fade Value="false" />
${t}	<Fades>
${t}		<FadeInLength Value="0" />
${t}		<FadeOutLength Value="0" />
${t}		<ClipFadesAreInitialized Value="true" />
${t}		<CrossfadeInState Value="0" />
${t}		<FadeInCurveSkew Value="0" />
${t}		<FadeInCurveSlope Value="0" />
${t}		<FadeOutCurveSkew Value="0" />
${t}		<FadeOutCurveSlope Value="0" />
${t}		<IsDefaultFadeIn Value="true" />
${t}		<IsDefaultFadeOut Value="true" />
${t}	</Fades>
${t}	<PitchCoarse Value="0" />
${t}	<PitchFine Value="0" />
${t}	<SampleVolume Value="1" />
${t}	<WarpMarkers>
${t}		<WarpMarker Id="0" SecTime="0" BeatTime="0" />
${t}		<WarpMarker Id="1" SecTime="${num(seconds)}" BeatTime="${end}" />
${t}	</WarpMarkers>
${t}	<SavedWarpMarkersForStretched />
${t}	<MarkersGenerated Value="false" />
${t}	<IsSongTempoLeader Value="false" />
${t}</AudioClip>`;
}

/**
 * The set, as XML: one audio track per stem in the order given, its clips in
 * the arrangement, the tempo as asked. `where` is the folder the set will be
 * written in, which the samples are named relative to.
 */
export function liveSetOf(template: string, tracks: readonly LiveTrack[], tempo: readonly TempoStep[], where: string): string {
  const open = template.indexOf('\t\t<Tracks>\n');
  const close = template.indexOf('\t\t</Tracks>');
  if (open < 0 || close < 0) throw new Error('no tracks in the Live template');
  const head = template.slice(0, open + '\t\t<Tracks>\n'.length);
  const found = tracksIn(template.slice(open, close));
  const prototype = found.find((track) => track.kind === 'AudioTrack');
  if (!prototype) throw new Error('no audio track in the Live template');
  const returns = found.filter((track) => track.kind === 'ReturnTrack');

  let next = Number(/<NextPointeeId Value="(\d+)" \/>/.exec(template)?.[1] ?? NaN);
  if (!Number.isFinite(next)) throw new Error('no NextPointeeId in the Live template');
  const trackIds = found.map((track) => Number(/ Id="(\d+)"/.exec(track.xml)?.[1] ?? 0));
  let trackId = Math.max(...trackIds) + 1;
  const had = (/\t\t<Scenes>[\s\S]*?\t\t<\/Scenes>/.exec(template)?.[0].match(/<Scene Id=/g) ?? []).length;
  const scenes = Math.max(had, ...tracks.flatMap((track) => track.clips.map((clip) => clip.scene + 1)));

  const made = tracks.map((track) => {
    let xml = prototype.xml.replace(/^(\t\t\t<AudioTrack Id=")\d+"/, `$1${trackId++}"`);
    // Every automation and modulation target, and every pointee, is an id
    // the whole set shares; the list positions (clip slots, sends) are not.
    xml = xml.replace(/<(\w*Target|Pointee) Id="\d+"/g, (_match, tag: string) => `<${tag} Id="${next++}"`);
    xml = xml.replace(/^(\t\t\t\t<Name>\n\t\t\t\t\t<EffectiveName Value=")[^"]*(" \/>\n\t\t\t\t\t<UserName Value=")[^"]*"/m, `$1${escape(track.name)}$2${escape(track.name)}"`);
    xml = xml.replace(/^(\t\t\t\t<Color Value=")\d+"/m, `$1${track.color}"`);
    xml = grown(xml, 'ClipSlotList', 'ClipSlot', scenes);
    const clips = track.clips.map((clip, index) => clipOf(clip, index, track.color, where)).join('');
    // The first sample sequencer is the arrangement's; the second is freeze's.
    const empty = /(<MainSequencer>[\s\S]*?<Sample>\s*<ArrangerAutomation>\s*)<Events \/>/;
    if (!empty.test(xml)) throw new Error('no arrangement in the Live template track');
    xml = xml.replace(empty, `$1<Events>${clips}\n\t\t\t\t\t\t\t\t</Events>`);
    for (const clip of track.clips) {
      const slot = new RegExp(`(<MainSequencer>[\\s\\S]*?<ClipSlot Id="${clip.scene}">\\s*<LomId Value="0" />\\s*<ClipSlot>\\s*)<Value />`);
      if (!slot.test(xml)) throw new Error(`no clip slot ${clip.scene} in the Live template track`);
      xml = xml.replace(slot, `$1<Value>${clipOf(clip, 0, track.color, where, 0)}\n\t\t\t\t\t\t\t\t\t</Value>`);
    }
    return xml;
  });

  let set = head + [...made, ...returns.map((track) => track.xml)].join('\n') + '\n' + template.slice(close);
  set = set.replace(/<NextPointeeId Value="\d+" \/>/, `<NextPointeeId Value="${next}" />`);

  // A scene per section, named for it, and carrying its tempo where the
  // sections were laid at more than one.
  set = grown(set, 'Scenes', 'Scene', scenes);
  const named = tracks[0]?.clips ?? [];
  const mixed = new Set(named.map((clip) => clip.bpm)).size > 1;
  for (const clip of named) {
    const scene = new RegExp(`(\\t\\t\\t<Scene Id="${clip.scene}">[\\s\\S]*?<Name Value=")[^"]*("[\\s\\S]*?<Tempo Value=")[^"]*(" />\\s*<IsTempoEnabled Value=")\\w+"`);
    if (!scene.test(set)) throw new Error(`no scene ${clip.scene} in the Live template`);
    set = set.replace(scene, `$1${escape(clip.name)}$2${num(clip.bpm)}$3${mixed}"`);
  }

  // The tempo: its value, and the envelope on it, which is what Live plays.
  const first = tempo[0]?.bpm ?? 120;
  const block = /(<Tempo>\s*<LomId Value="0" \/>\s*<Manual Value=")[^"]*("[\s\S]*?<AutomationTarget Id=")(\d+)"/.exec(set);
  if (!block) throw new Error('no tempo in the Live template');
  set = set.replace(block[0], `${block[1]}${num(first)}${block[2]}${block[3]}"`);
  const envelope = new RegExp(`(<PointeeId Value="${block[3]}" />\\s*</EnvelopeTarget>\\s*<Automation>\\s*<Events>)[\\s\\S]*?(\\s*</Events>)`);
  if (!envelope.test(set)) throw new Error('no tempo envelope in the Live template');
  const t = '\t'.repeat(8);
  let id = 0;
  const events = [`\n${t}<FloatEvent Id="${id++}" Time="-63072000" Value="${num(first)}" />`];
  for (const [index, step] of tempo.entries()) {
    if (index === 0 || step.bpm === tempo[index - 1].bpm) continue;
    // Two events at one time is a step, not a ramp.
    events.push(`\n${t}<FloatEvent Id="${id++}" Time="${num(step.at)}" Value="${num(tempo[index - 1].bpm)}" />`);
    events.push(`\n${t}<FloatEvent Id="${id++}" Time="${num(step.at)}" Value="${num(step.bpm)}" />`);
  }
  return set.replace(envelope, `$1${events.join('')}$2`);
}

/** Make `where` a Live Project: an empty `Ableton Project Info` folder is all Live looks for. */
export function markProject(where: string): void {
  fs.mkdirSync(path.join(where, 'Ableton Project Info'), { recursive: true });
}

/** Write it gzipped, which is what a `.als` is. */
export function writeLiveSet(file: string, xml: string): void {
  fs.writeFileSync(file, zlib.gzipSync(Buffer.from(xml, 'utf8')));
}
