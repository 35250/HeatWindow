"use strict";

const CONFIG = window.HEATWINDOW_CONFIG;

let idToken = null;
let accessToken = null;
let pendingSignupEmail = "";

const $ = (id) => document.getElementById(id);

// ---------- Messages and errors ----------

function showMessage(elementId, message, isError = false) {
  const element = $(elementId);
  element.textContent = message;
  element.hidden = false;
  element.classList.toggle("error", isError);
}

function clearMessage(elementId) {
  const element = $(elementId);
  element.textContent = "";
  element.hidden = true;
  element.classList.remove("error");
}

function getErrorMessage(error) {
  return error?.message || "Something went wrong. Please try again.";
}

function getCognitoUserMessage(error) {
  switch (error.code) {
    case "UserNotFoundException":
      return "User does not exist. Please create an account first.";

    case "NotAuthorizedException":
      return "Your email or password is incorrect. Please check your details.";

    case "UserNotConfirmedException":
      return "Please confirm your email address before signing in.";

    case "UsernameExistsException":
      return "An account with this email already exists. Please sign in instead.";

    case "InvalidPasswordException":
      return "Your password does not meet the required password rules.";

    case "CodeMismatchException":
      return "The confirmation code is incorrect. Please check your email and try again.";

    case "ExpiredCodeException":
      return "The confirmation code has expired. Request a new code.";

    case "ResourceNotFoundException":
      return "Account services are temporarily unavailable. Please try again later.";

    default:
      return getErrorMessage(error);
  }
}

function cleanRecommendation(text) {
  return String(text)
    .replace(/\*\*(.*?)\*\*/gs, "$1") // Remove bold markers
    .replace(/\*([^*\n]+)\*/g, "$1") // Remove italic markers
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // Remove heading markers
    .replace(/^\s*[-•]\s+/gm, "") // Remove bullet markers
    .replace(/^\s*\d+[.)]\s+/gm, "") // Remove numbered-list markers
    .replace(/`([^`]+)`/g, "$1") // Remove inline code markers
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------- Cognito: direct HTTPS API calls ----------
// No SDK or AWS access keys are required for these public user-pool APIs.

async function cognitoRequest(action, payload) {
  const response = await fetch(
    `https://cognito-idp.${CONFIG.region}.amazonaws.com/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": `AWSCognitoIdentityProviderService.${action}`,
      },
      body: JSON.stringify(payload),
    }
  );

  const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        const errorName = (result.__type || "")
            .split("#")
            .pop()
            .split(":")
            .pop();

        const error = new Error(
            result.message ||
            errorName ||
            `Cognito request failed with HTTP ${response.status}.`
        );

        error.code = errorName;
        throw error;
    }

  return result;
}

// ---------- Switching between auth screens ----------

function setAuthMode(mode) {
  $("signin-form").hidden = mode !== "signin";
  $("signup-form").hidden = mode !== "signup";
  $("confirm-form").hidden = mode !== "confirm";
  $("auth-tabs").hidden = mode === "confirm";

  $("tab-signin").classList.toggle("active", mode === "signin");
  $("tab-signup").classList.toggle("active", mode === "signup");

  clearMessage("auth-message");
}

function showApplication(email) {
  $("auth-section").hidden = true;
  $("app-section").hidden = false;
  $("signed-in-user").textContent = email || "Signed in";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showSignIn(email = "") {
  $("app-section").hidden = true;
  $("auth-section").hidden = false;
  $("signin-email").value = email;
  $("signin-password").value = "";
  setAuthMode("signin");
}

// ---------- Password requirements ----------

// This character class follows Cognito's documented special-character set.
const symbolPattern = /[\^$*.\[\]{}()?!"@#%&\/\\,><':;|_~`=+\-]/;

function checkPassword(password) {
  return {
    length: password.length >= 8,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    symbol: symbolPattern.test(password),
  };
}

function updatePasswordGuide() {
  const password = $("signup-password").value;
  const rules = checkPassword(password);

  for (const [name, passed] of Object.entries(rules)) {
    const item = document.querySelector(
      `#password-rules [data-rule="${name}"]`
    );

    item.classList.toggle("valid", passed);
    item.querySelector("span").textContent = passed ? "✓" : "○";
  }

  const confirm = $("signup-confirm-password").value;
  const message = $("password-match-message");

  message.classList.remove("match", "mismatch");

  if (!confirm) {
    message.textContent = "";
  } else if (password === confirm) {
    message.textContent = "Passwords match.";
    message.classList.add("match");
  } else {
    message.textContent = "Passwords do not match yet.";
    message.classList.add("mismatch");
  }

  return Object.values(rules).every(Boolean);
}

$("signup-password").addEventListener("input", updatePasswordGuide);
$("signup-confirm-password").addEventListener("input", updatePasswordGuide);

// ---------- Signup and email confirmation ----------

$("tab-signin").addEventListener("click", () => setAuthMode("signin"));
$("tab-signup").addEventListener("click", () => setAuthMode("signup"));

$("signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage("auth-message");

  if (!updatePasswordGuide()) {
    showMessage(
      "auth-message",
      "Please satisfy every password requirement shown above.",
      true
    );
    return;
  }

  const email = $("signup-email").value.trim();
  const password = $("signup-password").value;
  const confirmPassword = $("signup-confirm-password").value;

  if (password !== confirmPassword) {
    showMessage("auth-message", "The two passwords do not match.", true);
    return;
  }

  const button = $("signup-form").querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = "Creating account…";

  try {
    const result = await cognitoRequest("SignUp", {
      ClientId: CONFIG.clientId,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: "email", Value: email },
      ],
    });

    if (result.UserConfirmed) {
      showSignIn(email);
      showMessage(
        "auth-message",
        "Your account has been created. You can now sign in."
      );
    } else {
      pendingSignupEmail = email;
      setAuthMode("confirm");
      showMessage(
        "auth-message",
        `Check ${email} for the confirmation code and enter it below.`
      );
    }
  } catch (error) {
    console.error("Cognito signup failed:", error);
    showMessage("auth-message", getCognitoUserMessage(error), true);
  } finally {
    button.disabled = false;
    button.textContent = "Create account";
  }
});

$("confirm-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage("auth-message");

  try {
    await cognitoRequest("ConfirmSignUp", {
      ClientId: CONFIG.clientId,
      Username: pendingSignupEmail,
      ConfirmationCode: $("confirmation-code").value.trim(),
    });

    showSignIn(pendingSignupEmail);
    showMessage(
      "auth-message",
      "Email confirmed successfully. Sign in with your email and password."
    );

    $("signup-password").value = "";
    $("signup-confirm-password").value = "";
    updatePasswordGuide();
  } catch (error) {
    console.error("Cognito confirmation failed:", error);
    showMessage("auth-message", getCognitoUserMessage(error), true);
  }
});

$("resend-code").addEventListener("click", async () => {
  clearMessage("auth-message");

  try {
    await cognitoRequest("ResendConfirmationCode", {
      ClientId: CONFIG.clientId,
      Username: pendingSignupEmail,
    });

    showMessage("auth-message", "A new confirmation code has been requested.");
  } catch (error) {
    showMessage("auth-message", getCognitoUserMessage(error), true);
  }
});

// ---------- Sign in ----------

$("signin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage("auth-message");

  const email = $("signin-email").value.trim();
  const password = $("signin-password").value;
  const button = $("signin-form").querySelector('button[type="submit"]');

  button.disabled = true;
  button.textContent = "Signing in…";

  try {
    const result = await cognitoRequest("InitiateAuth", {
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: CONFIG.clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    if (!result.AuthenticationResult?.IdToken) {
      throw new Error(
        `Cognito requested an additional sign-in step (${result.ChallengeName || "unknown challenge"}). This frontend currently supports email and password sign-in without an additional challenge.`
      );
    }

    idToken = result.AuthenticationResult.IdToken;
    accessToken = result.AuthenticationResult.AccessToken || null;

    // Keep tokens in memory for this page session, not in localStorage.
    showApplication(email);
  } catch (error) {
    console.error("Cognito sign-in failed:", error);
    showMessage(
        "auth-message",
        getCognitoUserMessage(error),
        true
    );
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
});

$("signout-button").addEventListener("click", async () => {
  // Make a best-effort Cognito sign-out, then clear the local session.
  try {
    if (accessToken) {
      await cognitoRequest("GlobalSignOut", {
        AccessToken: accessToken,
      });
    }
  } catch (error) {
    console.warn("Cognito global sign-out could not be completed:", error);
  } finally {
    idToken = null;
    accessToken = null;
    showSignIn();
  }
});

// ---------- Date defaults ----------

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const today = new Date();
$("plan-date").min = localDateString(today);

const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
$("plan-date").value = localDateString(tomorrow);

// ---------- Dynamic task cards ----------

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function newTask() {
  const id = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id: `task-${id}`,
    name: "",
    flexibility: "",
    canPostpone: "",
    startLocation: "",
    endLocation: "",
    travelMode: "",
    travelDurationMinutes: "",
    activityDurationMinutes: "",
    intensity: "",
    vulnerability: "",
  };
}

function optionsHtml(options, selectedValue) {
  return `
    <option value="">Choose an option</option>
    ${options.map(([value, label]) => `
      <option value="${escapeHtml(value)}"
        ${String(selectedValue) === value ? "selected" : ""}>
        ${escapeHtml(label)}
      </option>
    `).join("")}
  `;
}

function taskCardHtml(task, index, total) {
  return `
    <article class="task-card" data-task-id="${escapeHtml(task.id)}">
      <div class="task-card-header">
        <div class="task-title">
          <span class="task-number">${index + 1}</span>
          <span>Task ${index + 1}</span>
        </div>

        <div class="task-actions">
          <button type="button" data-action="up"
            ${index === 0 ? "disabled" : ""}>↑ Up</button>
          <button type="button" data-action="down"
            ${index === total - 1 ? "disabled" : ""}>↓ Down</button>
          <button type="button" class="remove" data-action="remove"
            ${total === 1 ? "disabled" : ""}>Remove</button>
        </div>
      </div>

      <div class="task-fields">
        <label class="full-width">
          Task name
          <input name="name" value="${escapeHtml(task.name)}"
                 placeholder="e.g. Buy groceries" required>
        </label>

        <label>
          Scheduling flexibility
          <select name="flexibility" required>
            ${optionsHtml([
              ["fixed", "Fixed — difficult to move"],
              ["flexible", "Flexible — can be rescheduled"],
            ], task.flexibility)}
          </select>
          <small>Choose how much the timing can change.</small>
        </label>

        <label>
          Can this task be postponed?
          <select name="canPostpone" required>
            ${optionsHtml([
              ["false", "No — should not be postponed"],
              ["true", "Yes — can be postponed"],
            ], task.canPostpone)}
          </select>
        </label>

        <label>
          Start location
          <input name="startLocation"
                 value="${escapeHtml(task.startLocation)}"
                 placeholder="Jadavpur, Kolkata, West Bengal" required>
          <small>Format: area, city, state.</small>
        </label>

        <label>
          End location
          <input name="endLocation"
                 value="${escapeHtml(task.endLocation)}"
                 placeholder="Tollygunge, Kolkata, West Bengal" required>
          <small>Format: area, city, state.</small>
        </label>

        <label>
          Travel mode
          <select name="travelMode" required>
            ${optionsHtml([
              ["walking", "Walking"],
              ["cycling", "Cycling"],
              ["driving", "Driving"],
              ["public transport", "Public transport"],
              ["other", "Other"],
            ], task.travelMode)}
          </select>
        </label>

        <label>
          Travel duration (minutes)
          <input name="travelDurationMinutes" type="number"
                 min="1" max="1440" step="1"
                 value="${escapeHtml(task.travelDurationMinutes)}"
                 placeholder="e.g. 20" required>
          <small>Estimated time travelling from start to end location.</small>
        </label>

        <label>
          Activity duration (minutes)
          <input name="activityDurationMinutes" type="number"
                 min="1" max="1440" step="1"
                 value="${escapeHtml(task.activityDurationMinutes)}"
                 placeholder="e.g. 30" required>
          <small>Time spent doing the task, excluding travel.</small>
        </label>

        <label>
          Activity intensity
          <select name="intensity" required>
            ${optionsHtml([
              ["low", "Low"],
              ["moderate", "Moderate"],
              ["high", "High"],
            ], task.intensity)}
          </select>
          <small>Select one of the three allowed values.</small>
        </label>

        <label>
          Who is the task for?
          <select name="vulnerability" required>
            ${optionsHtml([
              ["adult", "Adult"],
              ["child", "Child"],
              ["elderly person", "Elderly person"],
              ["patient", "Patient"],
            ], task.vulnerability)}
          </select>
        </label>
      </div>
    </article>
  `;
}

// Read task fields in their current visible order.
function readTasks() {
  return [...document.querySelectorAll(".task-card")].map((card) => ({
    id: card.dataset.taskId,
    name: card.querySelector('[name="name"]').value.trim(),
    flexibility: card.querySelector('[name="flexibility"]').value,
    canPostpone: card.querySelector('[name="canPostpone"]').value,
    startLocation: card.querySelector('[name="startLocation"]').value.trim(),
    endLocation: card.querySelector('[name="endLocation"]').value.trim(),
    travelMode: card.querySelector('[name="travelMode"]').value,
    travelDurationMinutes:
      card.querySelector('[name="travelDurationMinutes"]').value,
    activityDurationMinutes:
      card.querySelector('[name="activityDurationMinutes"]').value,
    intensity: card.querySelector('[name="intensity"]').value,
    vulnerability: card.querySelector('[name="vulnerability"]').value,
  }));
}

function renderTasks(tasks) {
  $("task-list").innerHTML = tasks
    .map((task, index) => taskCardHtml(task, index, tasks.length))
    .join("");

  document.querySelectorAll(".task-card").forEach((card, index) => {
    card.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const updatedTasks = readTasks();
        const action = button.dataset.action;

        if (action === "remove" && updatedTasks.length > 1) {
          updatedTasks.splice(index, 1);
        } else if (action === "up" && index > 0) {
          [updatedTasks[index - 1], updatedTasks[index]] =
            [updatedTasks[index], updatedTasks[index - 1]];
        } else if (action === "down" && index < updatedTasks.length - 1) {
          [updatedTasks[index], updatedTasks[index + 1]] =
            [updatedTasks[index + 1], updatedTasks[index]];
        }

        renderTasks(updatedTasks);
      });
    });
  });
}

renderTasks([newTask()]);

$("add-task-button").addEventListener("click", () => {
  const tasks = readTasks();
  tasks.push(newTask());
  renderTasks(tasks);

  const cards = document.querySelectorAll(".task-card");
  cards[cards.length - 1].scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
});

// ---------- Build the backend request ----------

function buildRequest() {
  const date = $("plan-date").value;
  const start = $("window-start").value;
  const end = $("window-end").value;
  const homeLocation = $("home-location").value.trim();

  if (!date || !start || !end) {
    throw new Error("Complete the planning date and time window.");
  }

  if (start >= end) {
    throw new Error("The end time must be later than the start time.");
  }

  if (!homeLocation) {
    throw new Error("Enter your home location.");
  }

  const inputTasks = readTasks();

  if (inputTasks.length === 0) {
    throw new Error("Add at least one task.");
  }

  const tasks = inputTasks.map((task, index) => {
    if (!task.name || !task.startLocation || !task.endLocation) {
      throw new Error(`Complete the name and locations for Task ${index + 1}.`);
    }

    if (
      !task.flexibility ||
      !task.canPostpone ||
      !task.travelMode ||
      !task.intensity ||
      !task.vulnerability
    ) {
      throw new Error(`Complete all dropdowns for Task ${index + 1}.`);
    }

    const travel = Number(task.travelDurationMinutes);
    const activity = Number(task.activityDurationMinutes);

    if (!Number.isInteger(travel) || travel < 1 || travel > 1440) {
      throw new Error(`Enter a valid travel duration for Task ${index + 1}.`);
    }

    if (!Number.isInteger(activity) || activity < 1 || activity > 1440) {
      throw new Error(`Enter a valid activity duration for Task ${index + 1}.`);
    }

    return {
      id: task.id,
      name: task.name,
      scheduling: {
        flexibility: task.flexibility,
        canPostpone: task.canPostpone === "true",
      },
      startLocation: task.startLocation,
      endLocation: task.endLocation,
      travelMode: task.travelMode,
      travelDurationMinutes: travel,
      activityDurationMinutes: activity,
      intensity: task.intensity,
      vulnerability: task.vulnerability,
    };
  });

  const preferredRestMinutes = Number($("preferred-rest-minutes").value);

  if (
    !Number.isInteger(preferredRestMinutes) ||
    preferredRestMinutes < 1 ||
    preferredRestMinutes > 240
  ) {
    throw new Error("Preferred rest duration must be from 1 to 240 minutes.");
  }

  return {
    date,
    planningWindow: { start, end },
    homeLocation,
    preferences: {
      allowReturnHomeBetweenTasks: $("allow-return-home").checked,
      allowRestBreaks: $("allow-rest-breaks").checked,
      preferredRestMinutes,
    },
    tasks,
    notes: $("planning-notes").value.trim(),
  };
}

// ---------- Call the existing API Gateway endpoint ----------

$("schedule-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage("request-message");
  $("result-section").hidden = true;

  if (!idToken) {
    showMessage(
      "request-message",
      "Your sign-in session has ended. Please sign in again.",
      true
    );
    showSignIn();
    return;
  }

  // Native required-field and number validation.
  if (!$("schedule-form").reportValidity()) return;

  let request;

  try {
    request = buildRequest();
  } catch (error) {
    showMessage("request-message", getErrorMessage(error), true);
    return;
  }

  const button = $("submit-button");
  button.disabled = true;
  button.textContent = "Getting your recommendation…";

  try {
    const response = await fetch(CONFIG.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // API Gateway Cognito authorizer receives the ID token.
        Authorization: idToken,
      },
      body: JSON.stringify(request),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result.details ||
        result.message ||
        result.reason ||
        result.error ||
        `The request failed with HTTP ${response.status}.`
      );
    }

    const recommendation = result.recommendation ?? result;

    const recommendationText =
        typeof recommendation === "string"
            ? recommendation
            : JSON.stringify(recommendation, null, 2);

    $("recommendation-output").textContent =
    cleanRecommendation(recommendationText);

    $("result-section").hidden = false;
    $("result-section").scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  } catch (error) {
    console.error("Schedule request failed:", error);
    showMessage(
      "request-message",
      `${getErrorMessage(error)} Check your connection or the backend logs if the problem persists.`,
      true
    );
  } finally {
    button.disabled = false;
    button.textContent = "Recommend my schedule →";
  }
});

// Initial state.
setAuthMode("signin");

if (
  !CONFIG?.region ||
  !CONFIG?.clientId ||
  !CONFIG?.apiUrl
) {
  showMessage(
    "auth-message",
    "The frontend configuration is incomplete. Check config.js.",
    true
  );
}
