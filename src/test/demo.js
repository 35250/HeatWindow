const request = {
  date: "2026-10-12",

  planningWindow: {
    start: "10:00",
    end: "19:00"
  },

  homeLocation: "Jadavpur, Kolkata, West Bengal",
  preferences: {
    allowReturnHomeBetweenTasks: true,
    allowRestBreaks: true,
    preferredRestMinutes: 30
  },

  tasks: [
    {
      id: "task-1",
      name: "Take child to school",
      scheduling: {
        flexibility: "fixed",
        canPostpone: false
      },
      startLocation: "Jadavpur, Kolkata, West Bengal",
      endLocation: "Tollygunge, Kolkata, West Bengal",

      travelMode: "walking",
      travelDurationMinutes: 20,
      activityDurationMinutes: 5,

      intensity: "moderate",
      vulnerability: "child"
    },

    {
      id: "task-2",
      name: "Buy medicines",
      scheduling: {
        flexibility: "flexible",
        canPostpone: true
      },
      startLocation: "Tollygunge, Kolkata, West Bengal",
      endLocation: "Kalighat, Kolkata, West Bengal",

      travelMode: "walking",
      travelDurationMinutes: 15,
      activityDurationMinutes: 10,

      intensity: "low",
      vulnerability: "adult"
    },

    {
      id: "task-3",
      name: "Buy groceries",
      scheduling: {
        flexibility: "flexible",
        canPostpone: true
      },
      startLocation: "Kalighat, Kolkata, West Bengal",
      endLocation: "Ballygunge, Kolkata, West Bengal",

      travelMode: "walking",
      travelDurationMinutes: 15,
      activityDurationMinutes: 30,

      intensity: "moderate",
      vulnerability: "adult"
    }
  ],

  notes: ""
};

const {
  handler
} = require("../bedrock/recommendSchedule");

async function testHeatWindow() {
  try {
    const result = await handler({
      body: JSON.stringify(request)
    });

    console.log("\nHTTP STATUS:", result.statusCode);
    console.log("\nRESPONSE:");

    console.dir(JSON.parse(result.body), {
      depth: null
    });
  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

testHeatWindow();

