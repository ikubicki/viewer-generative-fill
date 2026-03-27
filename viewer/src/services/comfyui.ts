const COMFY_BASE = "http://127.0.0.1:8188";
const POLL_INTERVAL = 1000;
const POLL_TIMEOUT = 300_000; // 5 min

// ---- public: list available checkpoints ----

export async function getCheckpoints(): Promise<string[]> {
  const res = await fetch(`${COMFY_BASE}/object_info/CheckpointLoaderSimple`);
  if (!res.ok) throw new Error(`ComfyUI error ${res.status}`);
  const data = await res.json();
  const list: string[] =
    data?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
  return list;
}

// ---- helpers ----

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function uploadImage(
  dataUrl: string,
  filename: string,
  subfolder = "",
  overwrite = true
): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);
  const form = new FormData();
  form.append("image", blob, filename);
  if (subfolder) form.append("subfolder", subfolder);
  form.append("overwrite", overwrite ? "true" : "false");

  const res = await fetch(`${COMFY_BASE}/upload/image`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new Error(`ComfyUI upload error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.name as string;
}

async function queuePrompt(workflow: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${COMFY_BASE}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!res.ok) {
    throw new Error(`ComfyUI prompt error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.prompt_id as string;
}

async function pollResult(promptId: string): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    const res = await fetch(`${COMFY_BASE}/history/${promptId}`);
    if (!res.ok) continue;

    const history = await res.json();
    const entry = history[promptId];
    if (!entry) continue;

    if (entry.status?.completed === false && entry.status?.status_str === "error") {
      throw new Error("ComfyUI workflow execution failed");
    }

    const outputs = entry.outputs;
    if (!outputs) continue;

    // Find the first node with images
    for (const nodeId of Object.keys(outputs)) {
      const images = outputs[nodeId]?.images;
      if (images && images.length > 0) {
        const img = images[0];
        const url = `${COMFY_BASE}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder ?? "")}&type=${encodeURIComponent(img.type ?? "output")}`;
        // Fetch the image and convert to data URL
        const imgRes = await fetch(url);
        if (!imgRes.ok) throw new Error(`Failed to fetch result image`);
        const blob = await imgRes.blob();
        return await blobToDataUrl(blob);
      }
    }
  }
  throw new Error("ComfyUI generation timed out");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ---- inpainting workflow ----

function buildInpaintWorkflow(
  imageName: string,
  maskName: string,
  prompt: string,
  negativePrompt = "low quality, blurry, distorted, artifacts",
  steps = 20,
  cfg = 7.0,
  denoise = 0.85,
  checkpoint = "sd_xl_base_1.0.safetensors"
): Record<string, unknown> {
  return {
    // Node 1: Load Checkpoint
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: checkpoint,
      },
    },
    // Node 2: Load Image (source)
    "2": {
      class_type: "LoadImage",
      inputs: {
        image: imageName,
      },
    },
    // Node 3: Load Image (mask)
    "3": {
      class_type: "LoadImage",
      inputs: {
        image: maskName,
      },
    },
    // Node 4: Convert mask image to mask
    "4": {
      class_type: "ImageToMask",
      inputs: {
        image: ["3", 0],
        channel: "red",
      },
    },
    // Node 5: VAE Encode for inpainting
    "5": {
      class_type: "VAEEncodeForInpaint",
      inputs: {
        pixels: ["2", 0],
        vae: ["1", 2],
        mask: ["4", 0],
        grow_mask_by: 8,
      },
    },
    // Node 6: Positive prompt
    "6": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: prompt,
        clip: ["1", 1],
      },
    },
    // Node 7: Negative prompt
    "7": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: negativePrompt,
        clip: ["1", 1],
      },
    },
    // Node 8: KSampler
    "8": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
        seed: Math.floor(Math.random() * 2 ** 32),
        steps,
        cfg,
        sampler_name: "euler_ancestral",
        scheduler: "normal",
        denoise,
      },
    },
    // Node 9: VAE Decode
    "9": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["8", 0],
        vae: ["1", 2],
      },
    },
    // Node 10: Save Image
    "10": {
      class_type: "SaveImage",
      inputs: {
        images: ["9", 0],
        filename_prefix: "viewer_fill",
      },
    },
  };
}

// ---- public API ----

export async function generateFill(
  cropBase64: string,
  maskBase64: string,
  prompt: string,
  checkpoint?: string
): Promise<string> {
  // 0. Resolve checkpoint
  let ckpt = checkpoint;
  if (!ckpt) {
    const available = await getCheckpoints();
    if (available.length === 0) {
      throw new Error(
        "Brak checkpointów w ComfyUI. Dodaj model do katalogu models/checkpoints/ i zrestartuj ComfyUI."
      );
    }
    ckpt = available[0];
  }

  // 1. Upload images to ComfyUI
  const ts = Date.now();
  const [imageName, maskName] = await Promise.all([
    uploadImage(cropBase64, `viewer_crop_${ts}.png`),
    uploadImage(maskBase64, `viewer_mask_${ts}.png`),
  ]);

  // 2. Build and queue the inpainting workflow
  const workflow = buildInpaintWorkflow(imageName, maskName, prompt, undefined, undefined, undefined, undefined, ckpt);
  const promptId = await queuePrompt(workflow);

  // 3. Poll for result
  return await pollResult(promptId);
}
