import { browserAPI } from './utils.js';

// Default blocked domains
const defaultBlockedDomains = [
  'flashbang.sh',
  'dlproxy.uk',
  'tunnel1.dlproxy.uk',
  'gofile.io',
  'megadb.xyz',
  'pixeldrain.com',
  'spyderrock.com',
  'vikingfile.com'
];

// Wait for DOM to be fully loaded
window.addEventListener('DOMContentLoaded', function() {
  const toggleButton = document.getElementById('toggleButton');
  const settingsButton = document.getElementById('settingsButton');
  const domainsPanel = document.getElementById('domainsPanel');
  const backButton = document.getElementById('backButton');
  const domainInput = document.getElementById('domainInput');
  const addDomainButton = document.getElementById('addDomain');
  const domainList = document.getElementById('domainList');
  const statusText = document.getElementById('statusText');

  // Load initial state
  browserAPI.storage.sync.get(['isEnabled', 'blockedDomains'], function(data) {
    if (data.isEnabled) {
      toggleButton.classList.add('active');
      updateStatusText(true);
    } else {
      updateStatusText(false);
    }
    
    // Initialize blocked domains if not set
    if (!data.blockedDomains) {
      browserAPI.storage.sync.set({ blockedDomains: defaultBlockedDomains });
    }
    
    // Load and display domains
    updateDomainList(data.blockedDomains || defaultBlockedDomains);
  });

  function updateStatusText(isEnabled) {
    statusText.textContent = isEnabled ? 'Sending downloads to Ascendara' : 'Downloads going to browser';
  }

  // Toggle button handler
  toggleButton.addEventListener('click', function() {
    const isEnabled = !this.classList.contains('active');
    this.classList.toggle('active');
    browserAPI.storage.sync.set({isEnabled: isEnabled});
    updateStatusText(isEnabled);
  });

  // Settings panel handlers
  settingsButton.addEventListener('click', () => {
    domainsPanel.classList.add('show');
  });

  backButton.addEventListener('click', () => {
    domainsPanel.classList.remove('show');
  });

  // Add domain handler
  addDomainButton.addEventListener('click', addDomain);
  
  // Handle enter key in input
  domainInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      addDomain();
    }
  });

  function addDomain() {
    const domain = domainInput.value.trim().toLowerCase();
    
    if (!domain) {
      return;
    }
    
    const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '');
    
    browserAPI.storage.sync.get('blockedDomains', function(data) {
      const domains = data.blockedDomains || defaultBlockedDomains;
      
      if (domains.includes(cleanDomain)) {
        return;
      }
      
      const updatedDomains = [...domains, cleanDomain];
      browserAPI.storage.sync.set({blockedDomains: updatedDomains}, function() {
        domainInput.value = '';
        updateDomainList(updatedDomains);
      });
    });
  }

  function removeDomain(domain) {
    browserAPI.storage.sync.get('blockedDomains', function(data) {
      const domains = data.blockedDomains || [];
      const updatedDomains = domains.filter(d => d !== domain);
      browserAPI.storage.sync.set({blockedDomains: updatedDomains}, function() {
        updateDomainList(updatedDomains);
      });
    });
  }

  function updateDomainList(domains) {
    domainList.innerHTML = '';
    
    if (domains.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'domain-item';
      emptyMessage.innerHTML = '<span>No domains blocked</span>';
      domainList.appendChild(emptyMessage);
      return;
    }
    
    domains.forEach(domain => {
      const item = document.createElement('div');
      item.className = 'domain-item';
      
      const domainText = document.createElement('span');
      domainText.textContent = domain;
      
      const removeButton = document.createElement('button');
      removeButton.className = 'remove-domain';
      removeButton.textContent = 'Remove';
      removeButton.onclick = () => removeDomain(domain);
      
      item.appendChild(domainText);
      item.appendChild(removeButton);
      domainList.appendChild(item);
    });
  }
});