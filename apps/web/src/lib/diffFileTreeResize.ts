export const DIFF_FILE_TREE_WIDTH_STORAGE_KEY = "t3code:diff-file-tree-width";
export const DIFF_FILE_TREE_DEFAULT_WIDTH = 224;
export const DIFF_FILE_TREE_MIN_WIDTH = 164;

const DIFF_FILE_TREE_MAX_WIDTH = 480;
const DIFF_FILE_TREE_MAX_WIDTH_FRACTION = 0.6;
const DIFF_FILE_TREE_FALLBACK_CONTAINER_WIDTH = 540;

/**
 * Keep enough room for the code while still letting the tree grow on a wide
 * panel. The fallback matches the default right-panel width before its real
 * size is measured.
 */
export function getDiffFileTreeMaxWidth(containerWidth: number | null | undefined): number {
  const resolvedContainerWidth =
    typeof containerWidth === "number" && Number.isFinite(containerWidth) && containerWidth > 0
      ? containerWidth
      : DIFF_FILE_TREE_FALLBACK_CONTAINER_WIDTH;

  return Math.max(
    DIFF_FILE_TREE_MIN_WIDTH,
    Math.min(
      DIFF_FILE_TREE_MAX_WIDTH,
      Math.floor(resolvedContainerWidth * DIFF_FILE_TREE_MAX_WIDTH_FRACTION),
    ),
  );
}
