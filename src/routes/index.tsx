import { component$, useStore } from "@builder.io/qwik";
import { server$, type DocumentHead } from "@builder.io/qwik-city";
import sharp from "sharp";

const openai_image_url = "https://api.openai.com/v1/images/generations";
const huggingface_image_url =
  "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5";
const openai_summary_url = "https://api.openai.com/v1/chat/completions";

// Generate a data URL
const generateDataURL = (mediatype: string, data: Buffer) => {
  const data_url = "data:" + mediatype + ";base64," + data.toString("base64");
  return data_url;
};

// Generate image from summary
const generateHfImage = server$(async function (prompt: string) {
  const request_image_json = {
    inputs: prompt,
  };

  const response = await fetch(huggingface_image_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + this.env.get("HF_KEY"),
    },
    body: JSON.stringify(request_image_json),
  });
  if (response.ok) {
    const data = await response.arrayBuffer();
    const resizedData = await new Promise<Buffer>((resolve, reject) => {
      sharp(data)
        .resize({ width: 1200, height: 630, fit: "cover" })
        .toBuffer((err, buffer) => {
          if (err) reject(err);
          else resolve(buffer);
        });
    });

    return generateDataURL(
      response.headers.get("Content-Type") || "image/jpeg",
      resizedData,
    );
  }
  const msg = response.status + ": " + (await response.text());
  throw new Error(msg);
});

const generateOpenAiImage = server$(async function (prompt: string) {
  const request_image_json = {
    model: "dall-e-3",
    prompt: prompt,
    n: 1,
    size: "1200x630",
  };

  const response = await fetch(openai_image_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + this.env.get("HF_KEY"),
    },
    body: JSON.stringify(request_image_json),
  });
  if (response.ok) {
    const data = await response.json();
    console.log(data.data[0].url);
    return data.data[0].url;
  }
  const msg = response.status + ": " + (await response.text());
  throw new Error(msg);
});

const USE_OPENAI = false;

const generateImage = server$(async function (prompt: string) {
  if (USE_OPENAI) {
    return generateOpenAiImage(prompt);
  }
  return generateHfImage(prompt);
});

// Generate summary
const generateSummary = server$(async function (full_content: string) {
  const request_summary_json = {
    model: "gpt-4",
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "You are a highly skilled AI trained in language comprehension and summarization. I would like you to read the following text and provide an image description that would pair well with the content. Avoid descriptions that involve text or graphic design or images of people",
        // "You are a highly skilled AI trained in language comprehension and summarization. I would like you to read the following text and summarize it into a concise abstract paragraph. Aim to retain the most important points, providing a coherent and readable summary that could help a person understand the main points of the discussion without needing to read the entire text. Please avoid unnecessary details or tangential points.",
      },
      {
        role: "user",
        content: full_content,
      },
    ],
  };

  const response = await fetch(openai_summary_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + this.env.get("OPENAI_KEY"),
    },
    body: JSON.stringify(request_summary_json),
  });
  if (response.ok) {
    const data = await response.json();
    console.log(data.choices[0].message.content);
    return data.choices[0].message.content;
  }
  const msg = response.status + ": " + (await response.text());
  throw new Error(msg);
});

const generate_image_from_summary = server$(async function (
  full_content: string,
) {
  console.log(full_content);
  let generated_summary = full_content;
  const input_prompt_length = full_content.length;
  if (input_prompt_length > 300) {
    generated_summary = await generateSummary(full_content);
  }
  const generated_image = await generateImage(generated_summary);
  return generated_image;
});

export default component$(() => {
  const store = useStore({ url: "", loading: false, input: "" });
  return (
    <>
      <header class="header">
        <h1>Instant Cover Images</h1>
      </header>
      <form class="main maxed">
        <label for="content">Your text</label>
        <textarea
          id="content"
          disabled={store.loading}
          placeholder="Enter your blog post, podcast transcript, or any other text"
          onInput$={(_, target) => {
            store.input = target.value;
          }}
        ></textarea>
        <div class="action-buttons buttons">
          <button class="plain-button" type="reset">
            Clear
          </button>
          <button
            disabled={store.loading}
            onClick$={async () => {
              store.loading = true;
              store.url = await generate_image_from_summary(store.input);
            }}
            // {store.loading ? "Loading..." : "Generate!"}
            class="plain-button"
            type="submit"
          >
            Generate
          </button>
        </div>
      </form>
      <div class="result">
        <div class="result-inner maxed">
          {store.url && (
            <img
              src={store.url}
              width={1200}
              height={630}
              // alt={content}
            />
          )}
          {/* <img src="https://picsum.photos/1200/630" width=
            {1200} height={630} alt="${placeholder}" /> */}
          {/* <img src={store.url} width={1200} height={630} alt="${placeholder}" /> */}
          <div class="buttons">
            <button class="plain-button" type="button">
              Close
            </button>
            <a href="#" download class="plain-button">
              Download
            </a>
          </div>
        </div>
      </div>
      {/* {store.url && (
        <img
          src={store.url}
          width={1200}
          height={630}
          style={{
            maxWidth: "90vw",
            width: "1200px",
            height: 'auto',
            aspectRatio: "1200 / 630",
          }}
          alt="Generated image"
        />
      )} */}
    </>
  );
});

export const head: DocumentHead = {
  title: "Welcome to Qwik",
  meta: [
    {
      name: "description",
      content: "Qwik site description",
    },
  ],
};
