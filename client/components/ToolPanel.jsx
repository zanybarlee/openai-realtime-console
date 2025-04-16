import { useEffect, useState } from "react";

const colorPaletteDescription = `
Call this function when a user asks for a color palette.
`;

const foreignWorkerDescription = `
Call this function when a user asks about foreign worker requirements or employment passes.
`;

const sessionUpdate = {
  type: "session.update",
  session: {
    tools: [
      {
        type: "function",
        name: "display_color_palette",
        description: colorPaletteDescription,
        parameters: {
          type: "object",
          strict: true,
          properties: {
            theme: {
              type: "string",
              description: "Description of the theme for the color scheme.",
            },
            colors: {
              type: "array",
              description: "Array of five hex color codes based on the theme.",
              items: {
                type: "string",
                description: "Hex color code",
              },
            },
          },
          required: ["theme", "colors"],
        },
      },
      {
        type: "function",
        name: "foreign_worker_enquiry",
        description: foreignWorkerDescription,
        parameters: {
          type: "object",
          strict: true,
          properties: {
            question: {
              type: "string",
              description: "The question about foreign worker requirements",
            },
            sessionId: {
              type: "string",
              description: "Session ID for the query",
            },
          },
          required: ["question", "sessionId"],
        },
      },
    ],
    tool_choice: "auto",
  },
};

function FunctionCallOutput({ functionCallOutput }) {
  if (functionCallOutput.name === "display_color_palette") {
    const { theme, colors } = JSON.parse(functionCallOutput.arguments);

    const colorBoxes = colors.map((color) => (
      <div
        key={color}
        className="w-full h-16 rounded-md flex items-center justify-center border border-gray-200"
        style={{ backgroundColor: color }}
      >
        <p className="text-sm font-bold text-black bg-slate-100 rounded-md p-2 border border-black">
          {color}
        </p>
      </div>
    ));

    return (
      <div className="flex flex-col gap-2">
        <p>Theme: {theme}</p>
        {colorBoxes}
        <pre className="text-xs bg-gray-100 rounded-md p-2 overflow-x-auto">
          {JSON.stringify(functionCallOutput, null, 2)}
        </pre>
      </div>
    );
  } else if (functionCallOutput.name === "foreign_worker_enquiry") {
    const { question } = JSON.parse(functionCallOutput.arguments);
    return (
      <div className="flex flex-col gap-2">
        <div className="bg-white p-4 rounded-md shadow">
          <h3 className="font-semibold mb-2">Question:</h3>
          <p>{question}</p>
          <div className="mt-4">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="space-y-3 mt-4">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              </div>
            </div>
          </div>
        </div>
        <pre className="text-xs bg-gray-100 rounded-md p-2 overflow-x-auto">
          {JSON.stringify(functionCallOutput, null, 2)}
        </pre>
      </div>
    );
  }
}

export default function ToolPanel({
  isSessionActive,
  sendClientEvent,
  events,
}) {
  const [functionAdded, setFunctionAdded] = useState(false);
  const [functionCallOutput, setFunctionCallOutput] = useState(null);
  const [logs, setLogs] = useState([]);

  const addLog = (type, data) => {
    const timestamp = new Date().toISOString();
    setLogs(prevLogs => [{
      timestamp,
      type,
      data
    }, ...prevLogs].slice(0, 50)); // Keep last 50 logs
  };

  useEffect(() => {
    if (!events || events.length === 0) return;

    const firstEvent = events[events.length - 1];
    if (!functionAdded && firstEvent.type === "session.created") {
      addLog('Session Created', firstEvent);
      sendClientEvent(sessionUpdate);
      setFunctionAdded(true);
      addLog('Tools Registered', sessionUpdate.session.tools);
    }

    const mostRecentEvent = events[0];
    if (
      mostRecentEvent.type === "response.done" &&
      mostRecentEvent.response.output
    ) {
      mostRecentEvent.response.output.forEach((output) => {
        if (output.type === "function_call") {
          addLog('Function Call', {
            name: output.name,
            arguments: JSON.parse(output.arguments)
          });
          
          setFunctionCallOutput(output);
          if (output.name === "display_color_palette") {
            setTimeout(() => {
              sendClientEvent({
                type: "response.create",
                response: {
                  instructions: `
                  ask for feedback about the color palette - don't repeat 
                  the colors, just ask if they like the colors.
                `,
                },
              });
            }, 500);
          } else if (output.name === "foreign_worker_enquiry") {
            const args = JSON.parse(output.arguments);
            addLog('API Request', {
              endpoint: "http://127.0.0.1:3001/api/v1/prediction/445d78bd-6f55-4465-97b0-ba42c14d8a95",
              payload: {
                question: args.question,
                overrideConfig: {
                  sessionId: args.sessionId
                }
              }
            });
            
            fetch("http://127.0.0.1:3001/api/v1/prediction/445d78bd-6f55-4465-97b0-ba42c14d8a95", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                question: args.question,
                overrideConfig: {
                  sessionId: args.sessionId
                }
              })
            })
            .then(response => response.json())
            .then(data => {
              addLog('API Response', data);
              sendClientEvent({
                type: "response.create",
                response: {
                  instructions: data.text
                },
              });
            })
            .catch(error => {
              addLog('API Error', error);
              console.error("Error:", error);
              sendClientEvent({
                type: "response.create",
                response: {
                  instructions: "Sorry, there was an error processing your request."
                },
              });
            });
          }
        }
      });
    }
  }, [events]);

  useEffect(() => {
    if (!isSessionActive) {
      setFunctionAdded(false);
      setFunctionCallOutput(null);
      setLogs([]);
      addLog('Session Reset', { timestamp: new Date().toISOString() });
    }
  }, [isSessionActive]);

  return (
    <section className="h-full w-full flex flex-col gap-4">
      <div className="h-full bg-gray-50 rounded-md p-4">
        <h2 className="text-lg font-bold">Tools Panel</h2>
        {isSessionActive ? (
          <>
            {functionCallOutput ? (
              <FunctionCallOutput functionCallOutput={functionCallOutput} />
            ) : (
              <p>Ask about color palettes or foreign worker requirements...</p>
            )}
            
            {/* Logging Panel */}
            <div className="mt-6 border-t pt-4">
              <h3 className="text-md font-semibold mb-2">Debug Logs</h3>
              <div className="bg-gray-800 text-green-400 p-4 rounded-md h-64 overflow-y-auto font-mono text-sm">
                {logs.map((log, index) => (
                  <div key={index} className="mb-2">
                    <span className="text-gray-400">[{log.timestamp}]</span>
                    <span className="text-yellow-400"> {log.type}:</span>
                    <pre className="whitespace-pre-wrap overflow-x-auto">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p>Start the session to use these tools...</p>
        )}
      </div>
    </section>
  );
}
