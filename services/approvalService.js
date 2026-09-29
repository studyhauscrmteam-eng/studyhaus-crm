import { doc, getDoc, deleteDoc, setDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebase.js";

/**
 * Approve a pending admission
 * Moves the document from 'admissions' to 'students' collection
 * Assigns seat if selected
 */
export const approveAdmission = async (admissionId) => {
  try {
    const admissionRef = doc(db, "admissions", admissionId);
    const docSnap = await getDoc(admissionRef);
    
    if (!docSnap.exists()) {
      throw new Error("Admission record not found.");
    }
    
    const data = docSnap.data();
    data.approvalStatus = "Approved";
    data.status = "Active";
    data.updatedAt = new Date().toISOString();

    // Handle seat assignment if seat was selected
    let assignedSeat = data.seatAssigned || data.seatNumber;
    if (assignedSeat) {
      // Find and update the seat
      const seatQ = query(collection(db, "seats"), where("seatNumber", "==", assignedSeat));
      const seatSnap = await getDocs(seatQ);
      if (!seatSnap.empty) {
        const seatDoc = seatSnap.docs[0];
        const seatData = seatDoc.data();
        
        // Check if seat is available or reserved for this student
        if (seatData.status === "Available" || 
            (seatData.status === "Reserved" && seatData.assignedStudentId === admissionId)) {
          
          // Update seat to Occupied
          await updateDoc(seatDoc.ref, {
            status: "Occupied",
            assignedStudentId: admissionId,
            assignedStudentName: data.name,
            planType: data.planName,
            lastUpdated: new Date().toISOString()
          });
          
          // Ensure student data has seat number
          data.seatNumber = assignedSeat;
        }
      }
    }

    // Create in students collection
    const studentRef = doc(db, "students", admissionId);
    await setDoc(studentRef, data, { merge: true });

    // Update the corresponding user document to Active
    const userRef = doc(db, "users", admissionId);
    try {
      await updateDoc(userRef, { status: "Active" });
    } catch (e) {
      console.warn("Could not update users document (it may not exist if created via manual admin admission):", e);
    }

    // Remove from admissions collection
    await deleteDoc(admissionRef);
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Reject an admission
 * Releases any reserved seat
 */
export const rejectAdmission = async (admissionId, reason) => {
  try {
    const admissionRef = doc(db, "admissions", admissionId);
    const docSnap = await getDoc(admissionRef);
    
    // Release seat if assigned
    if (docSnap.exists()) {
      const data = docSnap.data();
      const assignedSeat = data.seatAssigned || data.seatNumber;
      if (assignedSeat) {
        const seatQ = query(collection(db, "seats"), where("seatNumber", "==", assignedSeat));
        const seatSnap = await getDocs(seatQ);
        if (!seatSnap.empty) {
          const seatDoc = seatSnap.docs[0];
          const seatData = seatDoc.data();
          
          // Only release if reserved for this student
          if (seatData.status === "Reserved" && seatData.assignedStudentId === admissionId) {
            await updateDoc(seatDoc.ref, { 
              status: "Available", 
              assignedStudentId: null,
              assignedStudentName: null,
              planType: null,
              lastUpdated: new Date().toISOString() 
            });
          }
        }
      }
    }
    
    await updateDoc(admissionRef, {
      approvalStatus: "Rejected",
      rejectReason: reason || "",
      status: "Rejected",
      updatedAt: new Date().toISOString()
    });

    const userRef = doc(db, "users", admissionId);
    try {
      await updateDoc(userRef, { status: "Rejected" });
    } catch (e) {
      console.warn("Could not update users document:", e);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Request Changes for an admission
 */
export const requestChangesAdmission = async (admissionId, notes) => {
  try {
    const admissionRef = doc(db, "admissions", admissionId);
    await updateDoc(admissionRef, {
      approvalStatus: "Changes Requested",
      adminNotes: notes || "",
      updatedAt: new Date().toISOString()
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
