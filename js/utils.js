export const score = (value) => Math.max(0, Math.min(5, Number(value) || 0));
export const overall = (log) => score(log.ratingOverall ?? log.rating);
export function filterLogs(
  logs,
  {
    query = "",
    region = "",
    filter = "all",
    sort = "date",
    favorites = [],
  } = {},
) {
  const terms = query
    .trim()
    .toLocaleLowerCase("ko")
    .split(/\s+/)
    .filter(Boolean);
  return logs
    .filter((log) => {
      const text = [log.name, log.region, log.memo]
        .join(" ")
        .toLocaleLowerCase("ko");
      return (
        terms.every((term) => text.includes(term)) &&
        (!region || log.region === region) &&
        (filter !== "best" || overall(log) >= 4) &&
        (filter !== "favorite" || favorites.includes(String(log.id)))
      );
    })
    .sort((a, b) => {
      if (sort === "name")
        return String(a.name).localeCompare(String(b.name), "ko");
      const dates = (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0);
      if (sort === "date") return dates;
      const rating = (item) =>
        sort === "ratingOverall" ? overall(item) : score(item[sort]);
      return rating(b) - rating(a) || dates;
    });
}
export function statistics(logs) {
  const rated = logs.filter((log) => overall(log) > 0);
  return {
    count: logs.length,
    average: rated.length
      ? (
          rated.reduce((sum, log) => sum + overall(log), 0) / rated.length
        ).toFixed(1)
      : "—",
    regions: new Set(logs.map((log) => log.region?.trim()).filter(Boolean))
      .size,
    best: logs.filter((log) => overall(log) >= 4).length,
  };
}
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function toCSV(logs) {
  const rows = [
    [
      "이름",
      "지역 / 양조장",
      "도수 (%)",
      "종합 평점",
      "가성비",
      "맛",
      "메모",
      "기록일",
      "사진 URL",
    ],
    ...logs.map((log) => [
      log.name,
      log.region,
      log.alcohol,
      overall(log),
      log.ratingPrice,
      log.ratingTaste,
      log.memo,
      log.date,
      log.image,
    ]),
  ];
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
export function safeImageURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
