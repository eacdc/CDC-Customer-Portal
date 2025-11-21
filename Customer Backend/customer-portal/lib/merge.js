// merge two DESC-sorted arrays by (UpdatedAt DESC, Id DESC)
export function mergeSorted(a, b, limit) {
  const out = [];
  let i = 0,
    j = 0;
  while (out.length < limit && (i < a.length || j < b.length)) {
    const L = a[i],
      R = b[j];
    const takeL =
      R === undefined ||
      L.UpdatedAt > R.UpdatedAt ||
      (L.UpdatedAt === R.UpdatedAt && L.Id > R.Id);
    if (takeL) {
      out.push(L);
      i++;
    } else {
      out.push(R);
      j++;
    }
  }
  return out;
}
