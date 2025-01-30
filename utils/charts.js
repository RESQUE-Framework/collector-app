function scaleValues(value, oldMin, oldMax, newMin, newMax) {
  return (value - oldMin) * (newMax - newMin) / (oldMax - oldMin) + newMin;
}

function renderScoreChart(canvasId, categories, animation = true) {
  const canvas = document.getElementById(canvasId);

  if (!canvas) {
    //console.error(`Canvas with id ${canvasId} not found`);
    return;
  }

  const ctx = canvas.getContext('2d');

  const data = {
    labels: categories.map(c => c.title),
    datasets: [{
      data: categories.map(c => scaleValues(c.score, 0, c.max, 0, 100)),
      borderWidth: 1,
      backgroundColor: categories.map((_, index) => getDefaultColor(index))
    }]
  };

  const config = {
    type: 'polarArea',
    data: data,
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: false // Disable the default legend
        }
      },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: {
            beginAtZero: true,
            display: false
          }
        }
      },
      animation: {
        duration: animation ? 300 : 0
      }
    }
  };

  const existingChart = Chart.getChart(ctx);
  if (existingChart) {
    existingChart.destroy();
  }

  const chart = new Chart(ctx, config);

  // Generate custom legend
  const legendContainer = document.getElementById('legend-container');
  if (legendContainer) {
    legendContainer.innerHTML = generateCustomLegend(categories);
  }

  return chart;
}

function getDefaultColor(index) {
  const defaultColors = [
    '#7fb1d3', '#8ed3c7', '#efd59d', '#bebada', '#fb8072', '#FF9F40'
  ];
  return defaultColors[index % defaultColors.length];
}

function generateCustomLegend(categories) {
  return categories.map((c, index) => `
    <div class="legend-item">
      <span class="legend-color" style="background-color: ${getDefaultColor(index)};"></span>
      <span class="legend-label">${c.title}</span>
    </div>
  `).join('');
}