export const radioTargetIndex = (
  key: string,
  currentIndex: number,
  itemCount: number,
) => {
  if (itemCount <= 0) return undefined;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  if (key === "ArrowRight" || key === "ArrowDown") {
    return currentIndex < 0 ? 0 : (currentIndex + 1) % itemCount;
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return currentIndex < 0
      ? itemCount - 1
      : (currentIndex - 1 + itemCount) % itemCount;
  }
  return undefined;
};
