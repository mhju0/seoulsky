import { test } from "node:test";
import assert from "node:assert/strict";
import { conditionFromKma, extractWarnings, tmFcToIso } from "./kma-mapping.ts";

test("conditionFromKma: PTY (강수형태) maps to precipitation", () => {
  assert.equal(conditionFromKma(1, 1), "rain"); // 비
  assert.equal(conditionFromKma(4, 1), "rain"); // 소나기
  assert.equal(conditionFromKma(2, 1), "sleet"); // 비/눈
  assert.equal(conditionFromKma(6, 1), "sleet"); // 빗방울눈날림
  assert.equal(conditionFromKma(3, 1), "snow"); // 눈
  assert.equal(conditionFromKma(7, 1), "snow"); // 눈날림
  assert.equal(conditionFromKma(5, 1), "drizzle"); // 빗방울
});

test("conditionFromKma: PTY overrides SKY (precip wins over a clear sky code)", () => {
  // Raining but SKY says clear → must read as rain, not clear.
  assert.equal(conditionFromKma(1, 1), "rain");
});

test("conditionFromKma: SKY (하늘상태) used only when PTY is 0", () => {
  assert.equal(conditionFromKma(0, 1), "clear");
  assert.equal(conditionFromKma(0, 3), "cloudy");
  assert.equal(conditionFromKma(0, 4), "overcast");
});

test("conditionFromKma: unknown codes fall back to 'unknown'", () => {
  assert.equal(conditionFromKma(0, 0), "unknown");
  assert.equal(conditionFromKma(0, 2), "unknown"); // SKY 2 is not a KMA code
  assert.equal(conditionFromKma(9, 0), "unknown");
});

test("tmFcToIso: yyyymmddHHMM → KST ISO; invalid → null", () => {
  assert.equal(tmFcToIso("202406141100"), "2024-06-14T11:00:00+09:00");
  assert.equal(tmFcToIso("202612312359"), "2026-12-31T23:59:00+09:00");
  assert.equal(tmFcToIso(""), null);
  assert.equal(tmFcToIso(undefined), null);
  assert.equal(tmFcToIso("2026-12-31"), null);
  assert.equal(tmFcToIso("20261231"), null);
});

test("extractWarnings: pulls hazard+level tokens from messy bulletin text", () => {
  const w = extractWarnings("[서울, 인천, 경기도] 호우주의보", {
    issuedAt: "2026-07-01T09:00:00+09:00",
    area: "서울",
  });
  assert.equal(w.length, 1);
  assert.equal(w[0].type, "호우");
  assert.equal(w[0].level, "주의보");
  assert.equal(
    w[0].id,
    '["kma","서울","호우","주의보","2026-07-01T09:00:00+09:00"]',
  );
  assert.equal(w[0].headline, "서울 호우주의보");
  assert.equal(w[0].source, "kma");
  assert.equal(w[0].issuedAt, "2026-07-01T09:00:00+09:00");
});

test("extractWarnings: multiple distinct hazards, deduped", () => {
  const w = extractWarnings("o 호우경보 : 서울\no 강풍주의보 : 서울\no 호우경보 : 인천", {
    issuedAt: null,
    area: "서울",
  });
  const tags = w.map((x) => `${x.type}${x.level}`).sort();
  assert.deepEqual(tags, ["강풍주의보", "호우경보"]);
});

test("extractWarnings: severity is part of normalized warning identity", () => {
  const w = extractWarnings("호우주의보 발효, 호우경보 발효", {
    issuedAt: "2026-07-01T09:00:00+09:00",
    area: "서울",
  });

  assert.equal(w.length, 2);
  assert.notEqual(w[0].id, w[1].id);
});

test("extractWarnings: a lift (해제) is NOT reported as an active warning", () => {
  assert.deepEqual(extractWarnings("강풍주의보 해제", { issuedAt: null, area: "서울" }), []);
  // mixed: one lifted, one active
  const w = extractWarnings("강풍주의보 해제, 호우주의보 발효", { issuedAt: null, area: "서울" });
  assert.equal(w.length, 1);
  assert.equal(w[0].type, "호우");
});

test("extractWarnings: 예비특보 headline formats with a space", () => {
  const w = extractWarnings("대설 예비특보", { issuedAt: null, area: "서울" });
  assert.equal(w.length, 1);
  assert.equal(w[0].level, "예비특보");
  assert.equal(w[0].headline, "서울 대설 예비특보");
});

test("extractWarnings: no hazard tokens → empty (never invents warnings)", () => {
  assert.deepEqual(extractWarnings("기상정보 제1호: 당분간 맑겠습니다.", { issuedAt: null, area: "서울" }), []);
});
