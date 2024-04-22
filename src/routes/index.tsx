import { component$, useStore } from "@builder.io/qwik";
import { server$, type DocumentHead } from "@builder.io/qwik-city";
import { buffer } from "stream/consumers";

const openai_image_url = "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5"
const openai_summary_url = "https://api.openai.com/v1/chat/completions"

// Generate a data URL
const generateDataURL= (mediatype:string, data:Buffer)=> {
  const data_url = "data:"
  + mediatype
  + ";base64,"
  + data.toString("base64")
  return data_url
}

// Generate image from summary
const generateHfImage = server$ (async function(prompt:string='') {
  // const request_image_json = {
  //   "model": "dall-e-3",
  //   "prompt": prompt,
  //   "n": 1,
  //   "size": "1024x1024"
  // }
  const request_image_json = {
    "inputs": prompt
  }

  const response = await fetch(openai_image_url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + this.env.get("HF_KEY")
      },
      body: JSON.stringify(request_image_json)
    }
  )
  if (response.ok) {
    const data = await response.arrayBuffer()

    return generateDataURL(response.headers.get('Content-Type')||"image/jpeg", Buffer.from(data))
  }
  const msg = response.status + ": " + await response.text()
  throw new Error(msg)
}
)

// Generate image from summary
const generateOpenAiImage = server$ (async function(prompt:string='') {
  // const request_image_json = {
  //   "model": "dall-e-3",
  //   "prompt": prompt,
  //   "n": 1,
  //   "size": "1024x1024"
  // }
  const request_image_json = {
    "inputs": prompt
  }

  const response = await fetch(openai_image_url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + this.env.get("HF_KEY")
      },
      body: JSON.stringify(request_image_json)
    }
  )
  if (response.ok) {
    const data = await response.json()
    console.log(data.data[0].url)
    return data.data[0].url
  }
  const msg = response.status + ": " + await response.text()
  throw new Error(msg)
}
)

// Generate summary
const generateSummary = server$ (async function(full_content:string) {
  const request_summary_json = {
    "model": "gpt-4",
    "temperature": 0,
    "messages": [
      {
        "role": "system",
        "content": "You are a highly skilled AI trained in language comprehension and summarization. I would like you to read the following text and summarize it into a concise abstract paragraph. Aim to retain the most important points, providing a coherent and readable summary that could help a person understand the main points of the discussion without needing to read the entire text. Please avoid unnecessary details or tangential points."
      },
      {
        "role": "user",
        "content": full_content
      }
    ]
  }

  const response = await fetch(openai_summary_url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + this.env.get("OPENAI_KEY")
      },
      body: JSON.stringify(request_summary_json)
    }
  )
  if (response.ok) {
    const data = await response.json()
    console.log(data.choices[0].message.content)
    return data.choices[0].message.content
  }
  const msg = response.status + ": " + await response.text()
  throw new Error(msg)
}
)

const generate_image_from_summary = server$ (async function(full_content:string) {
  let generated_summary = full_content
  const input_prompt_length = full_content.length
  if (input_prompt_length > 300) {
    generated_summary = await generateSummary(full_content)
  }
  const generated_image = await generateHfImage(generated_summary)
  return generated_image
})

const makeImage = async () => {
  return 'https://placekitten.com/200/300'
}

export default component$(() => {
  const store = useStore({ url: '' , loading: false, input: ''})
  return (
    <>
      <h1>Cat Image Generator!</h1>
      <input disabled={store.loading} placeholder="Enter prompt" onInput$={(_, target) => {
        store.input = target.value
      }}></input>
      <button disabled={store.loading} onClick$={async () => {
          store.loading = true
          // store.url = await generateImage()
          store.url = await generate_image_from_summary(store.input)
        }}>{store.loading?"Loading...":"Generate!"}</button>
      <br />
      {store.url && <img src={store.url} />}
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
