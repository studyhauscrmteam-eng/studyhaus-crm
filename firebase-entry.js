import { testFirebaseConnection } from "./firebase/testConnection.js";
import { initAuthGuard } from "./auth/guard.js";
import { enforceModulePermissions } from "./auth/middleware.js";
import { handleLogout } from "./auth/logout.js";
import { initDashboardListeners } from "./services/dashboardService.js";
import { initMembershipPlans } from "./services/membershipService.js";
import { initAdmissionsUI } from "./services/admissionService.js";
import { initStudentManagementUI } from "./services/studentProfile.js";
import { initStudentPortalUI } from "./services/studentPortalUI.js";
import { initAttendanceAdminUI } from "./services/attendanceAdminUI.js";
import { initPaymentAdminUI } from "./services/paymentAdminUI.js";
import { initComplaintAdminUI } from "./services/complaintAdminUI.js";
import { initSeatMapUI } from "./services/seatMapUI.js?v=play3";
import { initLiveSeatMapUI } from "./services/liveSeatMapUI.js?v=play3";
import { initExpenseAdminUI } from "./services/expenseAdminUI.js";
import { initVisitorAdminUI } from "./services/visitorAdminUI.js";
import { initMessageLogAdminUI } from "./services/messageLogAdminUI.js";
import { initOldStudentAdminUI } from "./services/oldStudentAdminUI.js";
import { initDashboardReminders } from "./services/dashboardReminderUI.js";
import { initRenewalAdminUI, renderRenewalForm, renderRenewalHistory } from "./services/renewalAdminUI.js";
import { websiteAdminUI } from "./services/websiteAdminUI.js";
import { openReportViewer, closeReportViewer } from "./services/reportAdminUI.js";
import { initAnalyticsUI } from "./services/analyticsService.js";
import { initAnnouncementAdminUI } from "./services/announcementAdminUI.js";
import { initStaffAdminUI } from "./services/staffAdminUI.js";
import { initTasksAdminUI } from "./services/tasksAdminUI.js";
import { initSettingsAdminUI } from "./services/settingsAdminUI.js";
import "./services/translationService.js";
import "./services/whatsappModalUI.js"; // Auto-injects modal styles and functions

// Expose the test function to the global window object
window.runFirebaseTest = testFirebaseConnection;

// Expose logout function globally so it can be called from onclick handlers in the UI
window.logout = handleLogout;

// Expose renewal form logic globally
window.renderRenewalForm = renderRenewalForm;
window.renderRenewalHistory = renderRenewalHistory;

// Expose Report Viewer logic globally
window.openReportViewer = openReportViewer;
window.closeReportViewer = closeReportViewer;

// Expose Document Upload logic globally
import { uploadGlobalDocument, loadGlobalDocuments, downloadBase64File } from "./services/documentUploadService.js";
window.uploadGlobalDocument = uploadGlobalDocument;
window.loadGlobalDocuments = loadGlobalDocuments;
window.downloadBase64File = downloadBase64File;

// Ensure downloadBase64File is available immediately (fallback)
if (typeof window.downloadBase64File !== 'function') {
  window.downloadBase64File = (base64Data, fileName) => {
    try {
      const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        const link = document.createElement('a');
        link.href = base64Data;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
      const mimeType = matches[1];
      const base64 = matches[2];
      const byteString = atob(base64);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ia], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download failed:", e);
      const link = document.createElement('a');
      link.href = base64Data;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };
}

// Initialize Authentication Guard
initAuthGuard();

import { onAuthStateChanged } from "./services/authService.js";

let __crmInitDone = false;
const initCrmModules = () => {
  if (__crmInitDone) return;
  __crmInitDone = true;
  // Move all dialogs to body to prevent them from failing to open if their parent page is hidden
  document.querySelectorAll("dialog").forEach((d) => document.body.appendChild(d));

  const role = localStorage.getItem("userRole");
  if (!role) return;
  enforceModulePermissions(role);
    // Initialize real-time dashboard listeners if we're on the dashboard
    initDashboardListeners();
    // Initialize the new unified Dashboard Reminders
    initDashboardReminders();
    // Initialize membership plans live feed
    initMembershipPlans();
    // Initialize admissions flow
    initAdmissionsUI();
    // Initialize student management flow
    initStudentManagementUI();
    // Initialize student portal
    initStudentPortalUI();
    // Initialize attendance admin viewer
    initAttendanceAdminUI();
    // Initialize payment admin viewer
    initPaymentAdminUI();
    // Initialize complaints admin viewer
    initComplaintAdminUI();
    // Initialize Seat Map viewer
    initSeatMapUI();
    // Initialize Live Seat Map viewer
    initLiveSeatMapUI();
    // Initialize Expense viewer
    initExpenseAdminUI();
    // Initialize Visitor viewer
    initVisitorAdminUI();
    // Initialize Message Log viewer
    initMessageLogAdminUI();
    // Initialize Old Student viewer
    initOldStudentAdminUI();
    // Initialize Renewal Module
    initRenewalAdminUI();
    // Initialize Announcements
    initAnnouncementAdminUI();
    // Initialize Staff UI
    initStaffAdminUI();
    // Initialize Tasks UI
    initTasksAdminUI();
    // Initialize Settings Admin UI
    initSettingsAdminUI();
    // Initialize Website CMS Module
    websiteAdminUI.init();
    // Initialize the Analytics page (live Firestore numbers)
    initAnalyticsUI();
};

// Wait for real Firebase Auth (not just localStorage) before attaching
// any Firestore snapshot listeners. Starting them with request.auth == null
// is what caused the flood of permission-denied errors.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    onAuthStateChanged((user) => {
      if (user) initCrmModules();
    });
  });
} else {
  onAuthStateChanged((user) => {
    if (user) initCrmModules();
  });
}

// console.log("Firebase setup complete. Guard active.");
