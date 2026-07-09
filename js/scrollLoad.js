// Chargement infini : declenche loadMore quand le sentinel approche du viewport
// (rootMargin = pre-charge avant que l'utilisateur atteigne le bas).
export function bindInfiniteScroll(sentinel, loadMore, { rootMargin = '720px 0px' } = {}) {
  if (!sentinel) return () => {};
  const io = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) loadMore();
  }, { rootMargin, threshold: 0 });
  io.observe(sentinel);
  return () => io.disconnect();
}
