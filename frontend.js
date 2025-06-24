const response = await fetch("/api/chat", {
  method: "POST",
  body: JSON.stringify({ messages }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  // Process streaming chunk
}
