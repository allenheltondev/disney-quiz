import { chat } from './bag/of/tricks.mjs';
import { CacheClient, CacheListFetchResponse, AuthClient, CredentialProvider, ExpiresIn } from '@gomomento/sdk';

const cacheClient = new CacheClient({ defaultTtlSeconds: 300 });
const authClient = new AuthClient({ credentialProvider: CredentialProvider.fromEnvironmentVariable('MOMENTO_API_KEY') });

export const handler = async (event) => {
  try {
    const key = event.requestContext.http.sourceIp;
    // const key = 'allen';
    const scope = {
      permissions:
        [{
          role: 'writeonly',
          cache: process.env.CACHE_NAME,
          item: { key }
        }]
    };

    let token = await authClient.generateDisposableToken(scope, ExpiresIn.minutes(5));

    let question;
    const historyResponse = await cacheClient.listFetch(process.env.CACHE_NAME, `${key}-history`);
    switch (historyResponse.type) {
      case CacheListFetchResponse.Miss:
        const params = {
          systemMessage: 'You are a Disney character master quiz giver and you specialize in identifying matching characters to the people talk to.',
          message: `You need to find out what disney character the person you are talking to best represents. It can be a protagonist or an antagonist, male or female. Ask a series of questions to help determine who this person is. Ask oddly personal questions and things about hobbies that would track with a Disney character. Don't go dark, don't ask something that would embarrass the person. Only ask one question at a time and they will provide you with an answer. Only ask questions that have a few word answers. Make your response include ONLY the question, don't add extra comments. When you know who this person is, then give your findings and explain why.`,
          chatId: `${key}-history`
        };
        question = await chat(params);
        break;
      case CacheListFetchResponse.Hit:
        const answer = await cacheClient.get(process.env.CACHE_NAME, key);
        const userAnswer = answer.value();
        question = await chat({ chatId: `${key}-history`, message: userAnswer });
        break;
    }

    const html = getHtml(question, token.authToken, key);

    const response = {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
      },
      body: html
    };
    return response;
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      body: JSON.stringify(e)
    };
  }
};

const getHtml = (question, token, key) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Disney Quiz</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <script>
        tailwind.config = {
          theme: {
            extend: {
              colors: {
                purple: '#250083',
                darkBlue: '#a238FF',
                lightBlue: '#AAE9FF'
              }
            }
          }
        }
    </script>
    </head>
    <body class="bg-gradient-to-br from-purple to-darkBlue text-white min-h-screen flex items-start justify-center p-6">
      <div class="max-w-4xl w-full mx-auto bg-white text-black p-6 rounded-lg shadow-lg">
        <form id="quizForm">
          <p>${question}</p>
          <label for="answer">Answer:</label>
          <input type="text" id="answer" name="answer">
          <button type="submit">Submit</button>
        </form>
      </div>
      <script>
        const token = "${token}";
        const form = document.getElementById('quizForm');
        const answerInput = document.getElementById('answer');

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const answer = answerInput.value;
          const response = await fetch('https://api.cache.cell-us-east-1-1.prod.a.momentohq.com/cache/${process.env.CACHE_NAME}?key=${key}&ttl_seconds=300', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': "${token}"
            },
            body: answer
          });

          window.location.reload();
        });

      </script>
    </body>
    </html>
  `;
};
