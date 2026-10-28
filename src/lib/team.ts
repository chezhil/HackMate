import "server-only";
import { AiUnavailableError, generate } from "./ai";
import { all, get, run, withAccountLock } from "./db";
import { getDetails } from "./details";
import { fmtDate } from "./format";
import { getHackathon } from "./repo";
import type { Teammate } from "./types";

type TeammateRow = Omit<Teammate, "confirmed"> & { confirmed: number };

export async function listTeam(hackathonId: string): Promise<Teammate[]> {
  const rows = await all<TeammateRow>(
    "SELECT id, name, role, skills, contact, confirmed FROM teammates WHERE hackathon_id = ? ORDER BY id",
    hackathonId,
  );
  return rows.map((row) => ({ ...row, confirmed: Boolean(row.confirmed) }));
}

export async function addTeammate(hackathonId: string, t: Omit<Teammate, "id">) {
  await run("INSERT INTO teammates (hackathon_id, name, role, skills, contact, confirmed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", hackathonId, t.name.trim(), t.role || null, t.skills || null, t.contact || null, t.confirmed ? 1 : 0, new Date().toISOString());
}

export async function updateTeammate(id: number, patch: Partial<Omit<Teammate, "id">>) {
  return withAccountLock(`team:updateTeammate:${id}`, async () => {
    const cur = await get<TeammateRow>("SELECT * FROM teammates WHERE id = ?", id);
    if (!cur) throw new Error("Teammate not found");
    await run("UPDATE teammates SET name = ?, role = ?, skills = ?, contact = ?, confirmed = ? WHERE id = ?", patch.name ?? cur.name,
        patch.role !== undefined ? patch.role : cur.role,
        patch.skills !== undefined ? patch.skills : cur.skills,
        patch.contact !== undefined ? patch.contact : cur.contact,
        patch.confirmed !== undefined ? (patch.confirmed ? 1 : 0) : cur.confirmed,
        id);
  });
}

export async function removeTeammate(id: number) {
  await run("DELETE FROM teammates WHERE id = ?", id);
}

export async function teamOf(id: number): Promise<string | null> {
  const row = await get<{ hackathon_id: string }>("SELECT hackathon_id FROM teammates WHERE id = ?", id);
  return row?.hackathon_id ?? null;
}

export interface PostInput {
  lookingFor: string;
  aboutMe: string;
  idea: string;
}

/** A "looking for teammates" post. Written by Groq when available, otherwise from a template. */
export async function draftTeammatePost(hackathonId: string, input: PostInput): Promise<{ text: string; provider: string | null }> {
  const h = await getHackathon(hackathonId);
  if (!h) throw new Error("Unknown hackathon");
  const team = await listTeam(hackathonId);
  const max = (await getDetails(hackathonId))?.info?.teamSize.max ?? h.teamMax;
  const when = h.startsAt ? fmtDate(h.startsAt) : h.endsAt ? `ends ${fmtDate(h.endsAt)}` : "";
  const where = h.mode === "online" ? "online" : [h.city, h.country].filter(Boolean).join(", ") || h.mode;

  const template = [
    `🚀 Looking for teammates for ${h.title}${when ? ` (${when}, ${where})` : ""}!`,
    input.aboutMe && `About me: ${input.aboutMe}`,
    team.length > 0 && `Team so far: ${team.map((t) => `${t.name}${t.role ? ` (${t.role})` : ""}`).join(", ")}`,
    input.lookingFor && `Looking for: ${input.lookingFor}`,
    input.idea && `Idea: ${input.idea}`,
    max && `${max - 1 - team.length > 0 ? `${max - 1 - team.length} spot(s) open` : "Team almost full"} · max team size ${max}`,
    h.url && `Details: ${h.url}`,
    "DM me if you're interested! #hackathon",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await generate({
      task: "post",
      temperature: 0.7,
      system:
        "Write a short, friendly 'looking for teammates' post for a hackathon (under 600 characters) that works on X, LinkedIn, Reddit and Discord. Plain text, at most 2 emojis, include the link and a clear call to action. Output only the post.",
      messages: [{ role: "user", content: `Use these facts, don't invent others:\n${template}` }],
    });
    return { text: res.text.trim(), provider: `${res.provider}:${res.model}` };
  } catch (e) {
    if (!(e instanceof AiUnavailableError)) console.warn("[team post]", (e as Error).message);
    return { text: template, provider: null };
  }
}
