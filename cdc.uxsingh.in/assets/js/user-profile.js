/**
 * User Profile Dropdown Updater
 * Updates the user profile dropdown with actual user data from localStorage
 */
'use strict';

(function () {
  const STORAGE_KEY = 'cdcAuthSession';

  function getStoredSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function formatUserName(email) {
    if (!email) return 'User';
    // Extract the part before @ and capitalize first letter
    const namePart = email.split('@')[0];
    return namePart.charAt(0).toUpperCase() + namePart.slice(1);
  }

  function updateUserProfile() {
    const session = getStoredSession();
    const userEmail = session?.email || null;
    const contactName = session?.contactName ? String(session.contactName).trim() : '';
    const userName = contactName || (userEmail ? formatUserName(userEmail) : 'User');
    const userInitial = userName.charAt(0).toUpperCase();

    // Update all user name display elements
    const userNameDisplays = document.querySelectorAll('[data-user-name], #user-name-display');
    userNameDisplays.forEach(element => {
      element.textContent = userName;
    });

    // Find all user dropdown menus
    const dropdownMenus = document.querySelectorAll('.dropdown-user .dropdown-menu');
    
    dropdownMenus.forEach(menu => {
      // Find the user info section (first li with dropdown-item mt-0)
      const userInfoItem = menu.querySelector('li:first-child .dropdown-item.mt-0');
      if (userInfoItem) {
        // Update the user name if there's an h6 element
        const nameElement = userInfoItem.querySelector('h6.mb-0');
        if (nameElement) {
          nameElement.textContent = userName;
        }
      }

      // Update "My Profile" to "View Profile" button (if not already updated)
      const profileLinks = menu.querySelectorAll('.dropdown-item');
      profileLinks.forEach(link => {
        const profileText = link.querySelector('span.align-middle');
        if (profileText && profileText.textContent.trim() === 'My Profile') {
          profileText.textContent = 'View Profile';
        }
      });
    });

    // Update the avatar icon in the navbar (remove image, show initials or icon)
    const navbarAvatars = document.querySelectorAll('.dropdown-user .avatar');
    navbarAvatars.forEach(avatarDiv => {
      if (!avatarDiv) return;
      const existingImg = avatarDiv.querySelector('img');
      if (existingImg) {
        existingImg.remove();
      }
      if (!avatarDiv.querySelector('.avatar-initials')) {
        const initials = document.createElement('div');
        initials.className = 'avatar-initials';
        initials.textContent = userInitial;
        initials.style.cssText =
          'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background-color: #696cff; color: white; font-weight: 600; border-radius: 50%;';
        avatarDiv.appendChild(initials);
      } else {
        avatarDiv.querySelector('.avatar-initials').textContent = userInitial;
      }
    });
  }

  // Run on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    updateUserProfile();
  });

  // Also run immediately if DOM is already loaded
  if (document.readyState === 'loading') {
    // DOM is still loading, wait for DOMContentLoaded
  } else {
    // DOM is already loaded
    updateUserProfile();
  }
})();

