const COMFY_BASE = "http://127.0.0.1:8188";
const POLL_INTERVAL = 1000;
const POLL_TIMEOUT = 300_000; // 5 min

// ---- FLUX Fill Dev model config ----
const FLUX_FILL_UNET = "flux1-fill-dev.safetensors";
const FLUX_CLIP_L = "clip_l.safetensors";
const FLUX_T5XXL = "t5xxl_fp16.safetensors";
const FLUX_VAE = "ae.safetensors";

// ---- public: list available UNET models ----

export async function getCheckpoints(): Promise<string[]> {
  const res = await fetch(`${COMFY_BASE}/object_info/UNETLoader`);
  if (!res.ok) throw new Error(`ComfyUI error ${res.status}`);
  const data = await res.json();
  const list: string[] =
    data?.UNETLoader?.input?.required?.unet_name?.[0] ?? [];
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

// ---- FLUX Fill Dev inpainting workflow ----

function buildFluxFillWorkflow(
  imageName: string,
  maskName: string,
  prompt: string,
  unetName = FLUX_FILL_UNET,
  steps = 20,
  cfg = 1.0,
  denoise = 1.0
): Record<string, unknown> {
  return {
    // Node 1: Load UNET (FLUX Fill Dev)
    "1": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: unetName,
        weight_dtype: "default",
      },
    },
    // Node 2: Load Dual CLIP (clip_l + t5xxl, type=flux)
    "2": {
      class_type: "DualCLIPLoader",
      inputs: {
        clip_name1: FLUX_CLIP_L,
        clip_name2: FLUX_T5XXL,
        type: "flux",
      },
    },
    // Node 3: Load VAE (FLUX ae)
    "3": {
      class_type: "VAELoader",
      inputs: {
        vae_name: FLUX_VAE,
      },
    },
    // Node 4: Load source image
    "4": {
      class_type: "LoadImage",
      inputs: {
        image: imageName,
      },
    },
    // Node 5: Load mask image
    "5": {
      class_type: "LoadImage",
      inputs: {
        image: maskName,
      },
    },
    // Node 6: Convert mask image to MASK type
    "6": {
      class_type: "ImageToMask",
      inputs: {
        image: ["5", 0],
        channel: "red",
      },
    },
    // Node 7: Positive prompt
    "7": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: prompt,
        clip: ["2", 0],
      },
    },
    // Node 8: Negative prompt (empty for FLUX)
    "8": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: "",
        clip: ["2", 0],
      },
    },
    // Node 9: InpaintModelConditioning (FLUX Fill native inpainting)
    "9": {
      class_type: "InpaintModelConditioning",
      inputs: {
        positive: ["7", 0],
        negative: ["8", 0],
        vae: ["3", 0],
        pixels: ["4", 0],
        mask: ["6", 0],
        noise_mask: true,
      },
    },
    // Node 10: KSampler
    "10": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["9", 0],
        negative: ["9", 1],
        latent_image: ["9", 2],
        seed: Math.floor(Math.random() * 2 ** 32),
        steps,
        cfg,
        sampler_name: "euler",
        scheduler: "simple",
        denoise,
      },
    },
    // Node 11: VAE Decode
    "11": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["10", 0],
        vae: ["3", 0],
      },
    },
    // Node 12: Save Image
    "12": {
      class_type: "SaveImage",
      inputs: {
        images: ["11", 0],
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
  // Resolve UNET model name
  const unet = checkpoint ?? FLUX_FILL_UNET;

  // 1. Upload images to ComfyUI
  const ts = Date.now();
  const [imageName, maskName] = await Promise.all([
    uploadImage(cropBase64, `viewer_crop_${ts}.png`),
    uploadImage(maskBase64, `viewer_mask_${ts}.png`),
  ]);

  // 2. Build and queue the FLUX Fill inpainting workflow
  const workflow = buildFluxFillWorkflow(imageName, maskName, prompt, unet);
  const promptId = await queuePrompt(workflow);

  // 3. Poll for result
  return await pollResult(promptId);
}
