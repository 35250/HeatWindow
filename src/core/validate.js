const ALLOWED_INTENSITIES = ["low", "moderate", "high"];
const ALLOWED_VULNERABILITIES = ["adult", "child", "elderly"];

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

function isValidTime(time) {
  if (typeof time !== "string") {
    return false;
  }

  if (!/^\d{2}:\d{2}$/.test(time)) {
    return false;
  }

  const [hours, minutes] = time.split(":").map(Number);

  return (
    hours >= 0 &&
    hours <= 23 &&
    minutes >= 0 &&
    minutes <= 59
  );
}

function isValidDate(date) {
  if (typeof date !== "string") {
    return false;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const [year, month, day] = date.split("-").map(Number);

  const parsedDate = new Date(year, month - 1, day);

  return (
    parsedDate.getFullYear() === year &&
    parsedDate.getMonth() === month - 1 &&
    parsedDate.getDate() === day
  );
}

function validateRequest(request) {
  if (!request || typeof request !== "object") {
    return {
      valid: false,
      reason: "Request is required."
    };
  }

  if (!request.date) {
    return {
      valid: false,
      reason: "Date is required."
    };
  }

  if (!isValidDate(request.date)) {
    return {
      valid: false,
      reason: "Invalid date. Use YYYY-MM-DD format."
    };
  }

  const [year, month, day] = request.date.split("-").map(Number);

  const requestedDate = new Date(year, month - 1, day);

  const now = new Date();

  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  if (requestedDate < today) {
    return {
      valid: false,
      reason: "Date cannot be in the past."
    };
  }

  if (!request.planningWindow) {
    return {
      valid: false,
      reason: "Planning window is required."
    };
  }

  const { start, end } = request.planningWindow;

  if (!isValidTime(start) || !isValidTime(end)) {
    return {
      valid: false,
      reason: "Planning window times must use HH:MM format."
    };
  }

  const planningStart = timeToMinutes(start);
  const planningEnd = timeToMinutes(end);

  if (planningEnd <= planningStart) {
    return {
      valid: false,
      reason: "Planning window end time must be after start time."
    };
  }

  if (requestedDate.getTime() === today.getTime()) {
    const currentTime =
      now.getHours() * 60 + now.getMinutes();

    if (planningStart <= currentTime) {
      return {
        valid: false,
        reason: "Today's planning window must start after the current time."
      };
    }
  }

  if (!Array.isArray(request.tasks) || request.tasks.length === 0) {
    return {
      valid: false,
      reason: "At least one task is required."
    };
  }

  if (request.tasks.length > 5) {
    return {
      valid: false,
      reason: "A maximum of 5 tasks can be scheduled at once."
    };
  }

  const planningDuration = planningEnd - planningStart;

  for (const task of request.tasks) {
    if (!task || typeof task !== "object") {
      return {
        valid: false,
        reason: "Every task must be valid."
      };
    }

    if (!task.name || typeof task.name !== "string") {
      return {
        valid: false,
        reason: "Every task must have a name."
      };
    }

    if (!task.startLocation || typeof task.startLocation !== "string") {
      return {
        valid: false,
        reason: `Start location is required for task "${task.name}".`
      };
    }

    if (!task.endLocation || typeof task.endLocation !== "string") {
      return {
        valid: false,
        reason: `End location is required for task "${task.name}".`
      };
    }

    if (
      !Number.isInteger(task.travelDurationMinutes) ||
      task.travelDurationMinutes < 0
    ) {
      return {
        valid: false,
        reason: `Travel duration for task "${task.name}" must be a non-negative whole number of minutes.`
      };
    }

    if (
      !Number.isInteger(task.activityDurationMinutes) ||
      task.activityDurationMinutes <= 0
    ) {
      return {
        valid: false,
        reason: `Activity duration for task "${task.name}" must be a positive whole number of minutes.`
      };
    }

    const totalTaskDuration =
      task.travelDurationMinutes + task.activityDurationMinutes;

    if (totalTaskDuration > planningDuration) {
      return {
        valid: false,
        reason: `Task "${task.name}" takes longer than the entire planning window.`
      };
    }

    if (!ALLOWED_INTENSITIES.includes(task.intensity)) {
      return {
        valid: false,
        reason: `Invalid intensity for task "${task.name}".`
      };
    }

    if (!ALLOWED_VULNERABILITIES.includes(task.vulnerability)) {
      return {
        valid: false,
        reason: `Invalid vulnerability for task "${task.name}".`
      };
    }
  }

  return {
    valid: true
  };
}

module.exports = {
  validateRequest,
  timeToMinutes,
  isValidTime,
  isValidDate
};