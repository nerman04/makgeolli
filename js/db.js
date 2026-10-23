import { SUPABASE_URL, SUPABASE_KEY } from "./supabase-config.js";
const bucket = "makgeolli-images";
const mapLog = (item) => ({
  id: item.id,
  name: item.name,
  region: item.region ?? item.brewery,
  alcohol: item.alcohol,
  ratingOverall: item.rating_overall ?? item.rating,
  ratingPrice: item.rating_price,
  ratingTaste: item.rating_taste,
  memo: item.memo,
  date: item.date,
  image: item.image_url,
  thumbnail: item.thumbnail_url,
});
async function request(path, { method = "GET", body, headers = {} } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      body,
      signal: controller.signal,
      headers: { apikey: SUPABASE_KEY, ...headers },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error.message || error.msg || `서버 응답 오류 (${response.status})`,
      );
    }
    return response.status === 204 ? null : response.json();
  } finally {
    clearTimeout(timeout);
  }
}
export const db = {
  async open() {},
  async getAllLogs() {
    const logs = [];
    for (let offset = 0; ; offset += 500) {
      const page = await request(
        `/rest/v1/logs?select=*&order=date.desc,id.desc&limit=500&offset=${offset}`,
      );
      logs.push(...page.map(mapLog));
      if (page.length < 500) return logs;
    }
  },
  async getLog(id) {
    const rows = await request(
      `/rest/v1/logs?select=*&id=eq.${encodeURIComponent(id)}`,
    );
    return rows[0] ? mapLog(rows[0]) : null;
  },
  async uploadFile(file) {
    const path = `${crypto.randomUUID()}.jpg`;
    await request(`/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      body: file,
      headers: { "Content-Type": "image/jpeg" },
    });
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  },
  async saveLog(data, previous = null) {
    let image = data.image,
      thumbnail = data.thumbnail;
    const uploaded = [];
    try {
      if (image instanceof Blob) {
        image = await this.uploadFile(image);
        uploaded.push(image);
      }
      if (thumbnail instanceof Blob) {
        thumbnail = await this.uploadFile(thumbnail);
        uploaded.push(thumbnail);
      }
    } catch (error) {
      await this.removeFiles(uploaded);
      throw error;
    }
    const row = {
      name: data.name,
      region: data.region,
      alcohol: data.alcohol,
      rating_overall: data.ratingOverall,
      rating_price: data.ratingPrice,
      rating_taste: data.ratingTaste,
      memo: data.memo,
      date: data.date,
      image_url: image || null,
      thumbnail_url: thumbnail || null,
    };
    // If a write's response is lost, its outcome is unknown. Retain uploaded images
    // so a committed row never points at a file removed by compensation.
    const rows = await request(
      "/rest/v1/logs" +
        (previous ? `?id=eq.${encodeURIComponent(previous.id)}` : ""),
      {
        method: previous ? "PATCH" : "POST",
        body: JSON.stringify(row),
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
      },
    );
    if (!rows?.length)
      throw new Error(
        "변경 권한이 없거나 기록이 삭제되었습니다. 새로고침 후 확인해 주세요.",
      );
    // Old images are retained: another record may reference them and concurrent edits may exist.
    return mapLog(rows[0]);
  },
  async addLog(data) {
    return this.saveLog(data);
  },
  async deleteLog(id) {
    const rows = await request(
      `/rest/v1/logs?id=eq.${encodeURIComponent(id)}`,
      { method: "DELETE", headers: { Prefer: "return=representation" } },
    );
    if (!rows?.length)
      throw new Error("삭제 권한이 없거나 이미 삭제된 기록입니다.");
    // Preserve storage objects to avoid breaking shared URLs or concurrent edits.
  },
  async removeFiles(urls) {
    const prefix = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/`;
    const paths = [
      ...new Set(
        urls
          .filter((url) => url?.startsWith(prefix))
          .map((url) => url.slice(prefix.length)),
      ),
    ];
    if (paths.length) {
      try {
        await request(`/storage/v1/object/${bucket}`, {
          method: "DELETE",
          body: JSON.stringify({ prefixes: paths }),
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.warn("미사용 사진 정리 실패", error);
      }
    }
  },
};
