import cloudinary from '../config/cloudinary';
import { Readable } from 'stream';

export class UploadService {
  /**
   * Faz upload de imagem para Cloudinary
   */
  static async uploadImagemRestaurante(
    fileBuffer: Buffer,
    restauranteId: string
  ): Promise<{ url: string; publicId: string }> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'restaurantes', // Pasta no Cloudinary
          public_id: `restaurante_${restauranteId}`,
          overwrite: true,
          transformation: [
            { width: 800, height: 600, crop: 'limit' }, // Resize automático
            { quality: 'auto' },
          ],
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              url: result!.secure_url,
              publicId: result!.public_id,
            });
          }
        }
      );

      const readableStream = Readable.from(fileBuffer);
      readableStream.pipe(uploadStream);
    });
  }

  /**
   * Deleta imagem antiga do Cloudinary
   */
  static async deletarImagem(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }
}