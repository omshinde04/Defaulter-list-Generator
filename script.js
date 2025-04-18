document.addEventListener("DOMContentLoaded", function () {
    const generateListButton = document.getElementById("generateList");

    // Prevent duplicate listeners
    generateListButton.replaceWith(generateListButton.cloneNode(true));
    const freshGenerateButton = document.getElementById("generateList");
    freshGenerateButton.addEventListener("click", processFiles);
});

// Normalize function to trim and lowercase column names
function normalize(text) {
    return text.trim().toLowerCase();
}

// Match columns with flexible keywords
function matchColumn(normalizedColumns, keywords) {
    return normalizedColumns.findIndex(col => 
        keywords.some(keyword => col.includes(keyword))
    );
}

// Function to read an Excel file and extract defaulters
function readExcelFile(file, threshold, index) {
    return new Promise((resolve) => {
        const reader = new FileReader();

        reader.onload = function (event) {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            if (workbook.SheetNames.length === 0) {
                resolve({ content: `<h3>${file.name} - Error</h3><p>⚠ No sheets found in the file.</p>`, index, defaulters: [] });
                return;
            }

            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) {
                resolve({ content: `<h3>${file.name} - Error</h3><p>⚠ No data found in the sheet.</p>`, index, defaulters: [] });
                return;
            }

            const columnNames = Object.keys(jsonData[0]);
            const normalizedColumns = columnNames.map(col => normalize(col));

            const rollNumberCol = columnNames[matchColumn(normalizedColumns, ["roll", "roll no"])];
            const studentNameCol = columnNames[matchColumn(normalizedColumns, ["name", "student name"])];
            const totalLecturesCol = columnNames[matchColumn(normalizedColumns, ["total", "total classes", "lectures", "held"])];
            const attendedLecturesCol = columnNames[matchColumn(normalizedColumns, ["attended", "present", "classes attended"])];
            
            if (!rollNumberCol || !studentNameCol || !totalLecturesCol || !attendedLecturesCol) {
                resolve({
                    content: `<h3>${file.name} - Error</h3><p>⚠ Required columns not found! Available columns: ${columnNames.join(", ")}</p>`,
                    index,
                    defaulters: []
                });
                return;
            }

            const defaulters = jsonData.filter(student => {
                const totalLectures = parseFloat(student[totalLecturesCol] || 0);
                const attendedLectures = parseFloat(student[attendedLecturesCol] || 0);

                if (totalLectures === 0) return false;

                const attendance = (attendedLectures / totalLectures) * 100;
                return attendance < threshold;
            });

            if (defaulters.length === 0) {
                resolve({ content: `<h3 class="text-lg font-semibold">${file.name} - Defaulters</h3><p>No defaulters found.</p>`, index, defaulters: [] });
                return;
            }

            let resultHtml = `<h3 class="text-lg font-semibold mb-2">${file.name} - Defaulters</h3>
            <table class="min-w-full table-auto border border-gray-300 divide-y divide-gray-200 text-sm text-left text-gray-700 shadow-md rounded-lg overflow-hidden">
                <thead class="bg-blue-600 text-white uppercase text-xs">
                    <tr>
                        <th class="px-6 py-3 border-r">Roll No</th>
                        <th class="px-6 py-3 border-r">Name</th>
                        <th class="px-6 py-3">Attendance (%)</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-100">`;

            defaulters.forEach(student => {
                const totalLectures = parseFloat(student[totalLecturesCol] || 0);
                const attendedLectures = parseFloat(student[attendedLecturesCol] || 0);
                const attendance = totalLectures > 0 ? ((attendedLectures / totalLectures) * 100).toFixed(2) : "0";

                resultHtml += `
                    <tr class="hover:bg-gray-50">
                        <td class="px-6 py-3 border-r">${student[rollNumberCol] || "N/A"}</td>
                        <td class="px-6 py-3 border-r">${student[studentNameCol] || "N/A"}</td>
                        <td class="px-6 py-3">${attendance}%</td>
                    </tr>`;
            });

            resultHtml += `</tbody></table>`;
            resolve({ 
                content: resultHtml, 
                index, 
                defaulters,
                fileName: file.name,
                columns: {
                    rollNumberCol,
                    studentNameCol,
                    totalLecturesCol,
                    attendedLecturesCol
                }
            });
        };

        reader.readAsArrayBuffer(file);
    });
}

// Function to process multiple Excel files and display defaulters
function processFiles() {
    const files = [
        document.getElementById("file1").files[0],
        document.getElementById("file2").files[0],
        document.getElementById("file3").files[0],
        document.getElementById("file4").files[0],
    ].filter((file) => file); // Remove empty file inputs

    const threshold = parseFloat(document.getElementById("threshold").value);
    const resultDiv = document.getElementById("result");

    resultDiv.innerHTML = ""; // Clear previous results
    resultDiv.style.display = "flex";
    resultDiv.style.gap = "20px";
    resultDiv.style.flexWrap = "wrap";

    if (files.length === 0) {
        alert("Please upload at least one Excel file.");
        return;
    }

    const readerPromises = files.map((file, index) => readExcelFile(file, threshold, index + 1));

    Promise.all(readerPromises).then((results) => {
        results.forEach(({ content, index, defaulters, fileName, columns }) => {
            const fileContainer = document.createElement("div");
            fileContainer.id = `fileContainer${index}`;
            fileContainer.className = "bg-white border border-gray-300 shadow-md rounded-md p-4 min-w-[320px] flex-1";

            fileContainer.innerHTML = content;

            const buttonContainer = document.createElement("div");
            buttonContainer.id = `buttonContainer${index}`;
            buttonContainer.className = "mt-4 flex gap-3";

            const excelButton = document.createElement("button");
            excelButton.innerText = `Download Excel (File ${index})`;
            excelButton.className = "bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700";
            excelButton.onclick = () => downloadExcel(defaulters, index);

            const pdfButton = document.createElement("button");
            pdfButton.innerText = `Download PDF (File ${index})`;
            pdfButton.className = "bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700";
            pdfButton.onclick = () => downloadPDF(fileContainer, fileName, index);

            buttonContainer.appendChild(excelButton);
            buttonContainer.appendChild(pdfButton);
            fileContainer.appendChild(buttonContainer);

            resultDiv.appendChild(fileContainer);
        });
    });
}

// Function to download the defaulters list as an Excel file
function downloadExcel(defaulters, fileIndex) {
    const ws = XLSX.utils.json_to_sheet(defaulters);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Defaulters");
    XLSX.writeFile(wb, `Defaulter_List_File${fileIndex}.xlsx`);
}








// Function to load PDF libraries
function loadPDFLibraries() {
    return new Promise((resolve, reject) => {
      // Check if libraries are already loaded
      if (window.html2canvas && window.jspdf) {
        resolve();
        return;
      }
  
      // Load html2canvas
      const html2canvasScript = document.createElement('script');
      html2canvasScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      html2canvasScript.onload = () => {
        console.log('html2canvas loaded successfully');
        
        // Load jsPDF after html2canvas is loaded
        const jsPDFScript = document.createElement('script');
        jsPDFScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        jsPDFScript.onload = () => {
          console.log('jsPDF loaded successfully');
          resolve();
        };
        jsPDFScript.onerror = () => {
          reject(new Error('Failed to load jsPDF library'));
        };
        document.body.appendChild(jsPDFScript);
      };
      html2canvasScript.onerror = () => {
        reject(new Error('Failed to load html2canvas library'));
      };
      document.body.appendChild(html2canvasScript);
    });
  }
  
  // Updated function to download the defaulters list as a PDF file
  async function downloadPDF(container, fileName, fileIndex) {
    // Create a separate loading indicator element outside the container
    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = `pdf-loading-indicator-${fileIndex}`;
    loadingIndicator.innerText = 'Generating PDF...';
    loadingIndicator.style.textAlign = 'center';
    loadingIndicator.style.padding = '10px';
    loadingIndicator.style.position = 'fixed';
    loadingIndicator.style.bottom = '20px';
    loadingIndicator.style.right = '20px';
    loadingIndicator.style.backgroundColor = '#f0f0f0';
    loadingIndicator.style.border = '1px solid #ccc';
    loadingIndicator.style.borderRadius = '5px';
    loadingIndicator.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    loadingIndicator.style.zIndex = '9999';
    
    try {
      // Show loading indicator
      const buttonContainer = container.querySelector(`#buttonContainer${fileIndex}`);
      if (buttonContainer) {
        buttonContainer.style.display = 'none';
      }
      
      // Add loading indicator to the body, not the container
      document.body.appendChild(loadingIndicator);
      
      // Make sure libraries are loaded before proceeding
      await loadPDFLibraries();
      
      // Create a clone of the container to avoid modifying the original
      const containerClone = container.cloneNode(true);
      
      // Remove any existing "Generating PDF..." messages from the clone
      const loadingMessages = containerClone.querySelectorAll('div');
      loadingMessages.forEach(msg => {
        if (msg.innerText === 'Generating PDF...') {
          msg.remove();
        }
      });
      
      // Append to body temporarily but hide it
      containerClone.style.position = 'absolute';
      containerClone.style.left = '-9999px';
      document.body.appendChild(containerClone);
      
      // Generate canvas from the cloned container
      const canvas = await html2canvas(containerClone, {
        scale: 2,
        logging: false,
        useCORS: true,
        backgroundColor: "#ffffff"
      });
      
      // Remove the clone
      document.body.removeChild(containerClone);
      
      // Create PDF
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jspdf.jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
  
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
  
      const imgWidth = pageWidth - 20;
      const imgHeight = canvas.height * imgWidth / canvas.width;
  
      // Add title
      pdf.setFontSize(16);
      pdf.text(`Defaulters List - ${fileName}`, 10, 15);
  
      if (imgHeight < (pageHeight - 30)) {
        // If the image fits on one page
        pdf.addImage(imgData, 'PNG', 10, 20, imgWidth, imgHeight);
      } else {
        // If the image needs multiple pages
        let heightLeft = imgHeight;
        let position = 20; // Initial position on first page
        let pageContentHeight = pageHeight - 20; // Available page height
        
        // For the first page
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight, null, 'FAST');
        heightLeft -= pageContentHeight;
        
        // For subsequent pages
        while (heightLeft > 0) {
          position = 0;
          pdf.addPage();
          pdf.addImage(
            imgData, 
            'PNG', 
            10, 
            position - (imgHeight - heightLeft), 
            imgWidth, 
            imgHeight, 
            null, 
            'FAST'
          );
          heightLeft -= pageContentHeight;
        }
      }
  
      // Save the PDF
      pdf.save(`Defaulter_List_File${fileIndex}.pdf`);
      
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("There was an error generating the PDF: " + error.message);
    } finally {
      // Remove the loading indicator
      if (loadingIndicator && loadingIndicator.parentNode) {
        loadingIndicator.parentNode.removeChild(loadingIndicator);
      }
      
      // Show buttons again
      const buttonContainer = container.querySelector(`#buttonContainer${fileIndex}`);
      if (buttonContainer) {
        buttonContainer.style.display = 'flex';
      }
    }
  }