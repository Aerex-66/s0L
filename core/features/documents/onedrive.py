"""
OneDrive discovery — reads the Windows registry to find local OneDrive
sync mount points (personal roots and SharePoint-synced libraries).
"""
import os


def discover_onedrive_roots():
    """Read Windows registry to find all OneDrive sync mount points."""
    import winreg
    roots = []
    accounts_key = r'Software\Microsoft\OneDrive\Accounts'
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, accounts_key) as accounts:
            i = 0
            while True:
                try:
                    acct_name = winreg.EnumKey(accounts, i)
                    i += 1
                except OSError:
                    break
                # Read account display name and user folder
                try:
                    with winreg.OpenKey(accounts, acct_name) as acct:
                        user_folder = winreg.QueryValueEx(acct, 'UserFolder')[0]
                        try:
                            display = winreg.QueryValueEx(acct, 'DisplayName')[0]
                        except OSError:
                            display = acct_name
                        try:
                            email = winreg.QueryValueEx(acct, 'UserEmail')[0]
                        except OSError:
                            email = ''
                        if user_folder and os.path.isdir(user_folder):
                            roots.append({
                                'path': user_folder,
                                'label': display,
                                'email': email,
                                'account': acct_name,
                            })
                except OSError:
                    continue
                # Also read ScopeIdToMountPointPathCache for SharePoint-synced libs
                try:
                    cache_path = acct_name + r'\ScopeIdToMountPointPathCache'
                    with winreg.OpenKey(accounts, cache_path) as cache:
                        vi = 0
                        while True:
                            try:
                                _, mount_path, _ = winreg.EnumValue(cache, vi)
                                vi += 1
                                if mount_path and os.path.isdir(mount_path) and mount_path != user_folder:
                                    roots.append({
                                        'path': mount_path,
                                        'label': os.path.basename(mount_path),
                                        'email': email,
                                        'account': acct_name,
                                    })
                            except OSError:
                                break
                except OSError:
                    pass
    except OSError:
        pass
    return roots
