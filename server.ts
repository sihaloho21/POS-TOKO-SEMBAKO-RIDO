import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Support high payload limit for receipt photos
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Initialize Gemini API client
  const apiKey = process.env.GEMINI_API_KEY;
  let ai: GoogleGenAI | null = null;
  if (apiKey) {
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  // Receipt OCR & Item Extraction Endpoint
  app.post('/api/scan-receipt', async (req, res) => {
    try {
      const { image, mimeType = 'image/jpeg', productCatalogHints = [] } = req.body;

      if (!image) {
        return res.status(400).json({ error: 'Foto atau gambar struk belanja diperlukan.' });
      }

      if (!ai) {
        return res.status(500).json({ 
          error: 'Gemini API belum dikonfigurasi. Pastikan GEMINI_API_KEY tersedia di environment.' 
        });
      }

      // Clean base64 string if it contains data URI scheme
      let base64Data = image;
      let detectedMime = mimeType;
      if (image.startsWith('data:')) {
        const matches = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          detectedMime = matches[1];
          base64Data = matches[2];
        } else {
          base64Data = image.replace(/^data:[^;]+;base64,/, '');
        }
      }

      // Build context hints from existing grocery products to help AI map abbreviations
      let catalogHintText = '';
      if (Array.isArray(productCatalogHints) && productCatalogHints.length > 0) {
        const sampleProducts = productCatalogHints.slice(0, 80).map((p: any) => p.name).join(', ');
        catalogHintText = `\nReferensi produk sembako yang sudah terdaftar di toko kami:\n[${sampleProducts}]\nJika nama di struk disingkat (misal 'BRS PNDN 5KG' atau 'MNYK GOR 2L'), cocokkan 'suggestedProductName' dengan nama produk toko yang paling mirip.`;
      }

      const prompt = `Anda adalah asisten AI kasir dan manajemen stok untuk Toko Sembako (kelontong & sembako grosir/eceran).
Tugas Anda adalah membaca gambar struk / nota / faktur belanjaan kulakan yang dilampirkan, lalu mengekstrak informasi terstruktur:
1. Nama toko / supplier (jika ada pada kop nota)
2. Nomor nota / faktur / invoice (jika ada)
3. Tanggal nota (format YYYY-MM-DD jika terbaca, atau kosongkan)
4. Total nominal struk
5. Daftar setiap item barang belanjaan:
   - rawName: nama teks barang persis seperti yang tertulis di struk (bisa berupa singkatan)
   - suggestedProductName: tebakan nama produk sembako lengkap dan jelas (contoh: 'BRS PNDN 5KG' -> 'Beras Pandan Wangi 5kg', 'GULA PS 1KG' -> 'Gula Pasir Gulaku 1kg')
   - quantity: kuantitas/jumlah yang dibeli (angka desimal atau bulat positif, default 1)
   - unit: satuan beli (misal: 'PCS', 'BKS', 'DUS', 'KARTON', 'SAK', 'BAL', 'KG', 'LITER', dll)
   - purchasePrice: harga beli per satuan (dalam rupiah, tanpa koma desimal rupiah)
   - discount: potongan harga/diskon baris item jika ada (default 0)
   - lineTotal: total subtotal baris (quantity * purchasePrice - discount)

Ketentuan:
- Abaikan teks non-barang seperti ucapan terima kasih, nomor antrean, kembalian, pajak terpisah jika ada.
- Jika kuantitas tidak eksplisit tertulis per baris (hanya harga), asumsikan kuantitas 1 dan harga satuan sama dengan subtotal.
- Pastikan angka harga satuan tidak tertukar dengan kuantitas atau nomor urut.${catalogHintText}`;

      const imagePart = {
        inlineData: {
          mimeType: detectedMime,
          data: base64Data,
        },
      };

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            role: 'user',
            parts: [
              imagePart,
              { text: prompt },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              storeName: {
                type: Type.STRING,
                description: 'Nama toko grosir, agen, atau supplier pada nota.',
              },
              invoiceNumber: {
                type: Type.STRING,
                description: 'Nomor nota, faktur, invoice, atau nomor transaksi.',
              },
              date: {
                type: Type.STRING,
                description: 'Tanggal transaksi pada nota dalam format YYYY-MM-DD atau teks tanggal.',
              },
              totalAmount: {
                type: Type.NUMBER,
                description: 'Total nominal akhir pada struk.',
              },
              items: {
                type: Type.ARRAY,
                description: 'Daftar barang belanjaan yang tertera di struk.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    rawName: {
                      type: Type.STRING,
                      description: 'Nama barang persis yang tertulis di struk.',
                    },
                    suggestedProductName: {
                      type: Type.STRING,
                      description: 'Nama produk lengkap/yang dinormalisasi.',
                    },
                    quantity: {
                      type: Type.NUMBER,
                      description: 'Jumlah kuantitas barang.',
                    },
                    unit: {
                      type: Type.STRING,
                      description: 'Satuan barang (PCS, DUS, KG, dll).',
                    },
                    purchasePrice: {
                      type: Type.NUMBER,
                      description: 'Harga satuan beli.',
                    },
                    discount: {
                      type: Type.NUMBER,
                      description: 'Potongan harga jika ada per item.',
                    },
                    lineTotal: {
                      type: Type.NUMBER,
                      description: 'Subtotal harga baris item.',
                    },
                  },
                  required: ['rawName', 'quantity', 'purchasePrice'],
                },
              },
            },
            required: ['items'],
          },
        },
      });

      const responseText = response.text || '{}';
      let parsedData;
      try {
        parsedData = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse Gemini JSON output:', responseText);
        return res.status(500).json({ 
          error: 'Format pembacaan struk tidak valid dari AI.',
          raw: responseText 
        });
      }

      return res.json({
        success: true,
        data: parsedData,
      });
    } catch (err: any) {
      console.error('Error scanning receipt:', err);
      return res.status(500).json({
        error: err.message || 'Gagal memproses struk belanja.',
      });
    }
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'harapan-jaya-pos-server' });
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 POS Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
