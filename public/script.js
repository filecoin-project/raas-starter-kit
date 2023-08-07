// The following code is present if you would like to make optional inputs more
// Granular in the frontend. For now, optional inputs will be hidden with default values set.
/*
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
*/

document.getElementById('jobRegistrationForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  document.getElementById('statusMessage').textContent = 'Loading...';

  const formData = new FormData(e.target);

  const response = await fetch('/api/register_job', {
    method: 'POST',
    body: formData
  });

  if (response.ok) {
    document.getElementById('statusMessage').textContent = 'Deal successfully submitted!';
  } else {
    document.getElementById('statusMessage').textContent = 'An error occurred. Please try again.';
  }
});

// Enable file upload on click.
document.getElementById('uploadButton').addEventListener('click', uploadFile);
  
async function uploadFile() {
  const fileInput = document.getElementById('fileUpload');
  const file = fileInput.files[0];

  // Check if a file was selected
  if (!file) {
    alert('Please select a file to upload');
    return;
  }

  // Create FormData to send the file
  const formData = new FormData();
  formData.append('file', file);

  // Send the file to the server to be uploaded to lighthouse
  const uploadResponse = await fetch('/api/uploadFile', {
    method: 'POST',
    body: formData
  });
  const responseJson = await uploadResponse.json();

  console.log("Uploaded file. Response: ", responseJson);

  // Assuming that the CID is available as a property on the response object
  const cid = responseJson.cid;

  // Populate the 'cid' box with the response
  document.getElementById('cid').value = cid;
}
