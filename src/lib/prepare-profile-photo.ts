import { validateProfilePhotoFile } from "./profile-avatar";

export async function prepareProfilePhoto(file: File): Promise<string> {
  validateProfilePhotoFile(file);
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error("Couldn't open this photo. Please choose another image."));
      img.src = objectUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error("This image has no readable dimensions");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser couldn't prepare the photo");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 256, 256);
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256,
    );
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1]!;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
