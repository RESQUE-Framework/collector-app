function scaleValues(value, oldMin, oldMax, newMin, newMax) {
  return (value - oldMin) * (newMax - newMin) / (oldMax - oldMin) + newMin;
}

function renderScoreChart(canvasId, categories) {
  const canvas = document.getElementById(canvasId);

  if (!canvas) {
    console.error(`Canvas with id ${canvasId} not found`);
    return;
  }

  const ctx = canvas.getContext('2d');

  const data = {
    labels: categories.map(c => c.title),
    datasets: [{
      data: categories.map(c => scaleValues(c.score, 0, c.max, 0, 10)),
      borderWidth: 1
    }]
  };

  const config = {
    type: 'polarArea',
    data: data,
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: false // Disable the legend
        }
      },
      scales: {
        r: {
          ticks: {
            beginAtZero: true,
            display: false
          }
        }
      }
    }
  };

  const existingChart = Chart.getChart(ctx);
  if (existingChart) {
    existingChart.destroy();
  }

  return new Chart(ctx, config);
}