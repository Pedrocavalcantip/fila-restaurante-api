import multer from 'multer';
import path from 'path';

// Storage em memória (para Cloudinary)
const storage = multer.memoryStorage();

// Validação de arquivos
const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Formato de imagem inválido. Use JPEG, PNG ou WebP.'), false);
  }
};

export const uploadImagem = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
}).single('imagem');