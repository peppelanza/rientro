// Pagination and free-text search for lists that can grow long (members, connections, threads,
// notifications, admin tables). Every paged endpoint answers { items, total, page, pages, per_page }
// and reads ?page= (1-based) and ?q= from the query string.

export function pageParams(query, perPage) {
  const page = Math.max(1, Math.floor(Number(query.get('page')) || 1));
  const q = (query.get('q') || '').trim().toLowerCase().slice(0, 80);
  return { page, q, perPage };
}

// rows already filtered and sorted; a page past the end shows the last one
export function paginate(rows, { page, perPage }, map = x => x) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const p = Math.min(page, pages);
  return { items: rows.slice((p - 1) * perPage, p * perPage).map(map), total, page: p, pages, per_page: perPage };
}

// The same, read from the database a page at a time (a long list, like a group's posts, isn't read
// whole): `from` is the query from FROM on, params its named parameters
export function paginateQuery(db, from, order, params, { page, perPage }, map = x => x) {
  const total = db.prepare(`SELECT COUNT(*) AS n ${from}`).get(params).n;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const p = Math.min(page, pages);
  const items = db.prepare(`SELECT * ${from} ORDER BY ${order} LIMIT $limit OFFSET $offset`).all({ ...params, $limit: perPage, $offset: (p - 1) * perPage }).map(map);
  return { items, total, page: p, pages, per_page: perPage };
}

// Case-insensitive "contains", on any of the given fields
export const matches = (q, ...fields) => !q || fields.flat().filter(Boolean).join(' ').toLowerCase().includes(q);
