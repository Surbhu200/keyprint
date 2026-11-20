/**
 * iPhone Safari grays out .glb files in the file picker when an input sets accept=".glb"
 * (iOS has no file type for glTF), so scan pickers accept any file and check the name here.
 */
export function isGlbFile(file: File): boolean {
  return /\.glb$/i.test(file.name);
}

export const NOT_A_GLB_MESSAGE =
  "That isn't a .glb scan. In Scaniverse or Polycam, export the scan as GLB, then choose that file.";
