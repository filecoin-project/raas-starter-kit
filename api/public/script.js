function toggleEpochInput() {
    const jobType = document.getElementById("jobType");
    const epochInput = document.getElementById("epochInput");
    const replicationTarget = document.getElementById("replicationTarget");
  
    // Reset visibility for both optional inputs
    epochInput.style.display = "none";
    replicationTarget.style.display = "none";
  
    // Determine which optional input to display based on the job type selected
    if (jobType.value === "renew" || jobType.value === "repair") {
      epochInput.style.display = "block";
    } else if (jobType.value === "replication") {
      replicationTarget.style.display = "block";
    }
  }
  
// Call the function initially to set the correct visibility on page load
document.addEventListener("DOMContentLoaded", function() {
    toggleEpochInput();
});
  