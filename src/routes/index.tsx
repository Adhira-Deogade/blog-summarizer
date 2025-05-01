import { component$ } from "@builder.io/qwik";
import {
  Form,
  routeAction$,
  server$,
  z,
  zod$,
  type DocumentHead,
} from "@builder.io/qwik-city";
import sharp from "sharp";

const openai_image_url = "https://api.openai.com/v1/images/generations";
const huggingface_image_url = "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0"
// const huggingface_image_url =
//   "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5";
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
    size: "1024x1024",
  };

  const response = await fetch(openai_image_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + this.env.get("OPENAI_KEY"),
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
          "You are a highly skilled AI trained in language comprehension and summarization. I would like you to read the following text and provide an image description that would pair well with the content. Avoid descriptions that involve text or graphic design or images of people. Focus on the most important topic and describe an image that matches that. Do not introduce too many individual concepts, do not use a collage, and do not explain the meaning or the reasoning behind the choices. Make the image pop with color and striking visuals. The description should describe the style of the image, either photograph, cartoon, digital render.",
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

export const useSummaryImageAction = routeAction$(
  async function (data, ctx) {
    try {
      let generated_summary = data.content;
      if (data.content.length > 300) {
        generated_summary = await generateSummary(data.content);
      }
      const generated_image: string = await generateImage(generated_summary);
      return { url: generated_image };
    } catch (err) {
      console.error(err);
      return ctx.fail(400, { message: "Failed to load image." });
    }
  },
  zod$({
    content: z.string().min(1),
  }),
);

export default component$(() => {
  const summaryImageAction = useSummaryImageAction();
  return (
    <>
      <header class="header">
        <h1>Instant Cover Images</h1>
      </header>
      {summaryImageAction.value?.failed && (
        <ul class="maxed">
          {summaryImageAction.value.message && (
            <li>{summaryImageAction.value.message}</li>
          )}
          {summaryImageAction.value.formErrors?.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
          {summaryImageAction.value.fieldErrors &&
            Object.entries(summaryImageAction.value.fieldErrors).map(
              ([key, errors]) =>
                errors.map((e, i) => (
                  <li key={i}>
                    {key}: {e}
                  </li>
                )),
            )}
        </ul>
      )}
      <Form class="main maxed" action={summaryImageAction}>
        <label for="content">Your text</label>
        <textarea
          id="content"
          name="content"
          value=""
          disabled={summaryImageAction.isRunning}
          placeholder="Enter your blog post, podcast transcript, or any other text"
        ></textarea>
        <div class="action-buttons buttons">
          <button class="plain-button" type="reset">
            Clear
          </button>
          <button
            disabled={summaryImageAction.isRunning}
            class="plain-button"
            type="submit"
          >
            {summaryImageAction.isRunning ? "Loading..." : "Generate!"}
          </button>
        </div>
      </Form>
      {summaryImageAction.value && !summaryImageAction.value.failed && (
        <div class="result">
          <div class="result-inner maxed">
            <img
              src={summaryImageAction.value.url}
              width={1200}
              height={630}
              // alt={content}
            />
            <div class="buttons">
              <button
                class="plain-button"
                type="button"
                onClick$={() => {
                  (summaryImageAction as any).value = null;
                }}
              >
                Close
              </button>
              <a
                href={summaryImageAction.value.url}
                download="cover-image"
                class="plain-button"
              >
                Download
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export const head: DocumentHead = {
  title: "Instant Cover Images",
  meta: [
    {
      name: "description",
      content: "Quickly generate cover images for blog posts",
    },
  ],
  links: [
    {
      rel: "icon",
      type: "image/svg+xml",
      href: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjE2MCIgdmlld0JveD0iMCAwIDE2IDE2IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8ZGVmcz4KPHBhdGggaWQ9InNwaXJhbCIgZD0iTTE0Ljc4MjEgMTMuMDE4M0MxNC44MzE2IDEyLjc1NjYgMTQuODc0NCAxMi40OTQyIDE0LjkxMDYgMTIuMjMxMUwxNC45MTk1IDEyLjE2NjZMMTQuOTIzNiAxMi4xMDE3QzE0Ljk0ODIgMTEuNzA3MiAxNC45NTg0IDExLjMxMzIgMTQuOTUzOSAxMC45MTk5TDE0Ljk1MzEgMTAuODU1NkwxNC45NDc3IDEwLjc5MTVDMTQuOTE0NyAxMC40MDM0IDE0Ljg2NzcgMTAuMDE4MSAxNC44MDY4IDkuNjM1NjZMMTQuNzk2NyA5LjU3MjY4TDE0Ljc4MjEgOS41MTA1OUMxNC42OTQ1IDkuMTM3NiAxNC41OTM4IDguNzY5NCAxNC40OCA4LjQwNjA5TDE0LjQ2MSA4LjM0NTUxTDE0LjQzNzcgOC4yODY0NkMxNC4yOTk1IDcuOTM2NDcgMTQuMTQ5NCA3LjU5MzA5IDEzLjk4NzQgNy4yNTY0NUwxMy45NTk5IDcuMTk5MjZMMTMuOTI4MyA3LjE0NDIxQzEzLjc0NDcgNi44MjQyOCAxMy41NTA1IDYuNTEyNTkgMTMuMzQ1OCA2LjIwOTI5TDEzLjMxMDIgNi4xNTY0NUwxMy4yNzA3IDYuMTA2MzRDMTMuMDQ3NiA1LjgyMjY0IDEyLjgxNTUgNS41NDg1NSAxMi41NzQzIDUuMjg0MjNMMTIuNTMxIDUuMjM2NzNMMTIuNDg0MyA1LjE5MjU0QzEyLjIyODIgNC45NTAyIDExLjk2NDcgNC43MTg1OCAxMS42OTQgNC40OTc4N0wxMS42NDM1IDQuNDU2NzVMMTEuNTkwMiA0LjQxOTQ5QzExLjMwODIgNC4yMjI1NiAxMS4wMjA2IDQuMDM3MjIgMTAuNzI3NSAzLjg2MzYzTDEwLjY3MDcgMy44Mjk5N0wxMC42MTE0IDMuODAwNjlDMTAuMzExIDMuNjUyMTEgMTAuMDA2OCAzLjUxNTY4IDkuNjk4OTQgMy4zOTE2TDkuNjM2NjQgMy4zNjY0OUw5LjU3MjYgMy4zNDYyM0M5LjI2MTM1IDMuMjQ3NzUgOC45NDgyNiAzLjE2MTcxIDguNjMzNDIgMy4wODgzMkw4LjU2NjkgMy4wNzI4MUw4LjQ5OTM3IDMuMDYyNTNDOC4xODUwOSAzLjAxNDcxIDcuODcwODcgMi45NzkzMiA3LjU1NjggMi45NTY1NUw3LjQ4NzYgMi45NTE1NEw3LjQxODIyIDIuOTUyMDJDNy4xMDg2MiAyLjk1NDE1IDYuODAwOTEgMi45Njg0MSA2LjQ5NTIgMi45OTQ5OEw2LjQyNTE4IDMuMDAxMDdMNi4zNTU4NiAzLjAxMjc1QzYuMDU4MzQgMy4wNjI5IDUuNzY0NDcgMy4xMjQ1OCA1LjQ3NDQxIDMuMTk3OTRMNS40MDU2MyAzLjIxNTMzTDUuMzM4NDggMy4yMzgyM0M1LjA2MDAxIDMuMzMzMjIgNC43ODY3OSAzLjQzODg1IDQuNTE5MDEgMy41NTUyNEw0LjQ1MzY0IDMuNTgzNjVMNC4zOTA4IDMuNjE3MjlDNC4xMzc2MSAzLjc1MjggMy44OTExMSAzLjg5NzggMy42NTE0OSA0LjA1MjM2TDMuNTkxNiA0LjA5MUwzLjUzNTA1IDQuMTM0MzdDMy4zMTI0OSA0LjMwNTA4IDMuMDk3OCA0LjQ4MzkgMi44OTEyIDQuNjcwODdMMi44Mzg2IDQuNzE4NDdMMi43OTAwMyA0Ljc3MDE2QzIuNjAyMzUgNC45Njk5MyAyLjQyMzQ1IDUuMTc2MjkgMi4yNTM1NCA1LjM4OTIxTDIuMjA5NjcgNS40NDQxOUwyLjE3MDM1IDUuNTAyNUMyLjAyMDU4IDUuNzI0NjcgMS44ODAyMSA1Ljk1MTc4IDEuNzQ5NDMgNi4xODM4TDEuNzE1MjggNi4yNDQzOUwxLjY4NjA1IDYuMzA3NUMxLjU3NTk3IDYuNTQ1MTIgMS40NzU2MiA2Ljc4NiAxLjM4NTE4IDcuMDMwMUwxLjM2MTMxIDcuMDk0NTJMMS4zNDI1NiA3LjE2MDYyQzEuMjcyNzYgNy40MDY3MiAxLjIxMjcyIDcuNjU0NDQgMS4xNjI2MiA3LjkwMzdMMS4xNDkyNCA3Ljk3MDI3TDEuMTQxMDUgOC4wMzc2N0MxLjExMDk2IDguMjg1NTIgMS4wOTA0MyA4LjUzMzM5IDEuMDc5NiA4Ljc4MTE5TDEuMDc2NjcgOC44NDgzNkwxLjA3ODkgOC45MTU1NkMxLjA4Njk2IDkuMTU4NzYgMS4xMDQxMyA5LjQwMDUzIDEuMTMwNTggOS42NDA3M0wxLjEzNzg5IDkuNzA3MTNMMS4xNTAyNCA5Ljc3Mjc3QzEuMTk0MDIgMTAuMDA1NSAxLjI0NjI4IDEwLjIzNTQgMS4zMDcxOSAxMC40NjI0TDEuMzI0NDYgMTAuNTI2OEwxLjM0NjU4IDEwLjU4OTdDMS40MjI5MiAxMC44MDY3IDEuNTA2OTcgMTEuMDE5NyAxLjU5ODg3IDExLjIyODZMMS42MjU4IDExLjI4OThMMS42NTczMSAxMS4zNDg4QzEuNzYyNDUgMTEuNTQ1NSAxLjg3NDQxIDExLjczNzIgMS45OTMzMiAxMS45MjM4TDIuMDI5NTcgMTEuOTgwN0wyLjA3MDA5IDEyLjAzNDZDMi4xOTk4MiAxMi4yMDcyIDIuMzM1MzkgMTIuMzczOSAyLjQ3Njg4IDEyLjUzNDZMMi41MjIxIDEyLjU4NTlMMi41NzExOCAxMi42MzM2QzIuNzIwOTEgMTIuNzc4OSAyLjg3NTQ0IDEyLjkxNzggMy4wMzQ4MiAxMy4wNDk4TDMuMDg4NTMgMTMuMDk0M0wzLjE0NTYgMTMuMTM0M0MzLjMxMDUxIDEzLjI1MDEgMy40NzkxMiAxMy4zNTg4IDMuNjUxNDMgMTMuNDYwMkwzLjcxMjk3IDEzLjQ5NjNMMy43NzcyNiAxMy41Mjc0QzMuOTUyMzEgMTMuNjEyIDQuMTI5OTIgMTMuNjg5MSA0LjMxMDA3IDEzLjc1ODRMNC4zNzg0OCAxMy43ODQ3TDQuNDQ4ODUgMTMuODA1M0M0LjYyODg5IDEzLjg1NzcgNC44MTAzMyAxMy45MDI2IDQuOTkzMDcgMTMuOTM5NEw1LjA2Njk3IDEzLjk1NDNMNS4xNDE4NyAxMy45NjI4QzUuMzIxNjQgMTMuOTgzMSA1LjUwMTY2IDEzLjk5NTggNS42ODE3MyAxNC4wMDAzTDUuNzU5MiAxNC4wMDIzTDUuODM2NTQgMTMuOTk3NEM2LjAxMDg2IDEzLjk4NjQgNi4xODQyMiAxMy45Njc4IDYuMzU2MzMgMTMuOTQxM0w2LjQzNDkzIDEzLjkyOTJMNi41MTIxIDEzLjkxQzYuNjc1ODQgMTMuODY5MyA2LjgzNzQ0IDEzLjgyMTQgNi45OTY1NSAxMy43NjU5TDcuMDczMzYgMTMuNzM5MUw3LjE0NzM2IDEzLjcwNTNDNy4yOTU3MyAxMy42Mzc1IDcuNDQwODEgMTMuNTYzMSA3LjU4MjE5IDEzLjQ4MTdMNy42NTQwMyAxMy40NDA0TDcuNzIxNjUgMTMuMzkyNEM3Ljg1MDMgMTMuMzAxMiA3Ljk3NDY3IDEzLjIwNCA4LjA5NDI3IDEzLjEwMDdMOC4xNTc5NyAxMy4wNDU3TDguMjE2MSAxMi45ODQ4QzguMzIxNTEgMTIuODc0NCA4LjQyMTc1IDEyLjc1OSA4LjUxNjMgMTIuNjM4Nkw4LjU2ODk1IDEyLjU3MTVMOC42MTQ4MiAxMi40OTk3QzguNjk0MzQgMTIuMzc1MSA4Ljc2ODAxIDEyLjI0NjcgOC44MzUyOCAxMi4xMTQzTDguODc0MzkgMTIuMDM3M0w4LjkwNTc1IDExLjk1NjlDOC45NTc3NCAxMS44MjM1IDkuMDAzNDEgMTEuNjg3MyA5LjA0MjE4IDExLjU0ODVMOS4wNjU3NiAxMS40NjQxTDkuMDgwNzggMTEuMzc3N0M5LjEwNDYgMTEuMjQwNyA5LjEyMTc4IDExLjEwMjIgOS4xMzE3NSAxMC45NjI0TDkuMTM4MTEgMTAuODczMUw5LjEzNTMyIDEwLjc4MzZDOS4xMzExIDEwLjY0ODMgOS4xMjAwOSAxMC41MTI3IDkuMTAxNjggMTAuMzc3MUw5LjA4OTI1IDEwLjI4NTVMOS4wNjcyNSAxMC4xOTU4QzkuMDM1NzQgMTAuMDY3MiA4Ljk5NzM2IDkuOTM5NTQgOC45NTE1NCA5LjgxMzI2TDguOTE4NiA5LjcyMjVMOC44NzU4OCA5LjYzNTkxQzguODE4MTkgOS41MTg5NyA4Ljc1MzY0IDkuNDA0MjIgOC42ODE3NSA5LjI5MjQ1TDguNjI2NDEgOS4yMDY0MUw4LjU2MTQzIDkuMTI3NDJDOC40Nzg5OCA5LjAyNzE5IDguMzg5ODkgOC45MzA3NSA4LjI5MzgxIDguODM5MTJMOC4yMTQzOSA4Ljc2MzM5TDguMTI2MTIgOC42OTgxN0M4LjAyMTEzIDguNjIwNTkgNy45MSA4LjU0ODYzIDcuNzkyNjggOC40ODM1OEw3LjY4OSA4LjQyNjA5TDcuNTc4NTEgOC4zODMxMUM3LjQ1NDYyIDguMzM0OTMgNy4zMjYwOCA4LjI5NDYyIDcuMTkzMjYgOC4yNjM0Nkw3LjA2OTA5IDguMjM0MzJMNi45NDIgOC4yMjM1QzYuODA2MzcgOC4yMTE5NSA2LjY2ODkxIDguMjEwMjYgNi41MzAzOSA4LjIxOTI4TDYuMzk2MDggOC4yMjgwMkw2LjI2NDcgOC4yNTcyQzYuMTMzNSA4LjI4NjM0IDYuMDA0MzcgOC4zMjUzIDUuODc4MTIgOC4zNzQxNkM1LjM4NDM0IDguNDY3NjQgNC45Mzk0NSA4LjcwNDExIDQuNTg5NjcgOS4wMzk5NUM0LjU4NTUgOC45ODI2MyA0LjU4MjEzIDguOTI0OTUgNC41Nzk1NyA4Ljg2Njg4QzQuNTg1NzQgOC43NTQ0MSA0LjU5NTEgOC42NDExNCA0LjYwNzcxIDguNTI3MDRDNC42MzIxIDguNDEyMjQgNC42NTk5NSA4LjI5NzIzIDQuNjkxMzEgOC4xODE5N0M0LjczNDg3IDguMDY4MjUgNC43ODIwNCA3Ljk1NDk1IDQuODMyODkgNy44NDIwNEM0Ljg5NjAyIDcuNzMyODMgNC45NjI4MiA3LjYyNDY5IDUuMDMzMzkgNy41MTc2QzUuMTE2MDggNy40MTYyNCA1LjIwMjQyIDcuMzE2NjEgNS4yOTI0OSA3LjIxODdDNS4zOTQzNSA3LjEyODQ4IDUuNDk5NzUgNy4wNDA2NSA1LjYwODc2IDYuOTU1MjVDNS43MjkwMyA2Ljg3OTQyIDUuODUyNjQgNi44MDY2OCA1Ljk3OTY2IDYuNzM3MDdDNi4xMTcxOCA2LjY3ODkzIDYuMjU3NzEgNi42MjQ1NyA2LjQwMTM1IDYuNTc0MDVDNi41NTQ0MSA2LjUzNjg5IDYuNzEwMDQgNi41MDQyIDYuODY4MzMgNi40NzYwNkM3LjAzNDUyIDYuNDYzMTEgNy4yMDI3MiA2LjQ1NTMgNy4zNzI5NyA2LjQ1MjdDNy41NDkxMiA2LjQ2Njk0IDcuNzI2NTQgNi40ODY5IDcuOTA1MjYgNi41MTI2OEM4LjA4NzM3IDYuNTU2NjMgOC4yNjk4NiA2LjYwNjc1IDguNDUyNzQgNi42NjMxN0M4LjYzNjA2IDYuNzM4NTkgOC44MTg3MyA2LjgyMDQ5IDkuMDAwNzQgNi45MDg5OUM5LjE3OTkyIDcuMDE2NzIgOS4zNTczMSA3LjEzMTAzIDkuNTMyOSA3LjI1MjAzQzkuNzAyMjIgNy4zOTE4IDkuODY4NTUgNy41MzgwMiAxMC4wMzE5IDcuNjkwNzdDMTAuMTg1NSA3Ljg2MTE0IDEwLjMzNSA4LjAzNzU3IDEwLjQ4MDIgOC4yMjAxNEMxMC42MTI0IDguNDE4NDggMTAuNzM5NCA4LjYyMjIyIDEwLjg2MSA4LjgzMTQ4QzEwLjk2NjYgOS4wNTQwMSAxMS4wNjU5IDkuMjgxMTEgMTEuMTU4OCA5LjUxMjg1QzExLjIzMzIgOS43NTQ4NSAxMS4zMDA0IDEwLjAwMDQgMTEuMzYwMyAxMC4yNDk0QzExLjM5OTcgMTAuNTA1NCAxMS40MzEyIDEwLjc2MzYgMTEuNDU0NyAxMS4wMjQxQzExLjQ1NjMgMTEuMjg3OCAxMS40NDk1IDExLjU1MjUgMTEuNDM0MyAxMS44MTgyQzExLjM5NjQgMTIuMDgzMiAxMS4zNDk4IDEyLjM0NzcgMTEuMjk0NSAxMi42MTE5QzExLjI1MzYgMTIuNzQ3OCAxMS4yMTAzIDEyLjg4MzMgMTEuMTY0NiAxMy4wMTgzSDE0Ljc4MjFaIi8+CjwvZGVmcz4KPHVzZSBocmVmPSIjc3BpcmFsIiBzdHJva2U9IndoaXRlIiBmaWxsPSJub25lIiBzdHJva2Utd2lkdGg9IjIiIC8+Cjx1c2UgaHJlZj0iI3NwaXJhbCIgc3Ryb2tlPSJub25lIiBmaWxsPSIjMTA4MkMxIiAvPgo8L3N2Zz4K"
    },
  ],
};
