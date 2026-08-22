// 사진·스캔본을 글자로 바꾸는 화면 쪽 길(22-51).
//
// 서버로 보내기 전에 브라우저에서 줄인다. 요청 본문 상한이 750KB이고 원본 사진은 그보다 크다.
// 폭은 1600px로 고정한다 — 실측에서 원본과 같은 값을 다 읽었고 84원이었다.
import { OCR_MAX_IMAGES, OCR_TOO_MANY, OCR_WIDTH, isImageType } from '../server/ocr.js';
import { loadModule } from './module-loader.js';

export { OCR_MAX_IMAGES, OCR_TOO_MANY, isImageType };

// 사진 한 장을 1600px 폭 JPEG으로 줄여 data URL로 만든다.
// 세로가 긴 등록증도 폭 기준으로 맞춘다 — 글자 크기는 폭이 정한다.
export async function shrinkImage(file, width = OCR_WIDTH) {
  const bitmap = await createImageBitmap(file);
  const scale = bitmap.width > width ? width / bitmap.width : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.8);
}

// 글자가 없는 PDF는 쪽을 그림으로 그려서 같은 길로 보낸다.
// 한 번에 세 쪽까지만 본다. 스캔 계획서 40쪽을 통째로 읽으면 비용이 감당되지 않는다.
export async function pdfPageImages(buffer, pages = OCR_MAX_IMAGES, width = OCR_WIDTH) {
  const pdfjs = await loadModule(() => import('pdfjs-dist'), 'PDF 읽기');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const images = [];
  for (let pageNo = 1; pageNo <= Math.min(pdf.numPages, pages); pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    images.push(canvas.toDataURL('image/jpeg', 0.8));
  }
  return { images, totalPages: pdf.numPages };
}

// 읽어 온 글자를 파일 읽기 결과와 같은 모양으로 돌려준다.
// 화면 나머지가 그대로 쓰게 하려는 것이고, 사진에서 왔다는 것은 type으로 남긴다.
export function ocrResult(name, size, text, { pages = 1, from = '사진' } = {}) {
  return { name, type: from === 'PDF' ? 'PDF(스캔본)' : '사진', size, text, pages, tables: 0, extracted: true, ocr: true };
}
